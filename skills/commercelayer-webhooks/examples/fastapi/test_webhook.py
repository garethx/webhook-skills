import os
import json
import hmac
import hashlib
import base64

from fastapi.testclient import TestClient

# Set test environment variables before importing the app.
os.environ["COMMERCELAYER_SHARED_SECRET"] = "test_shared_secret"

from main import app, verify_commercelayer_signature

client = TestClient(app)

SECRET = os.environ["COMMERCELAYER_SHARED_SECRET"]


def generate_signature(payload: bytes, secret: str) -> str:
    """Generate a valid Commerce Layer signature (base64 HMAC-SHA256 of the raw body)."""
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest()
    ).decode("utf-8")


def order_payload(order_id: str = "yzkWXfWDnu") -> bytes:
    return json.dumps(
        {"data": {"id": order_id, "type": "orders", "attributes": {"number": 1234, "status": "placed"}}}
    ).encode("utf-8")


class TestVerifyCommerceLayerSignature:
    def test_valid_signature_returns_true(self):
        payload = order_payload()
        signature = generate_signature(payload, SECRET)
        assert verify_commercelayer_signature(payload, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = order_payload()
        assert verify_commercelayer_signature(payload, "invalid", SECRET) is False

    def test_missing_signature_returns_false(self):
        payload = order_payload()
        assert verify_commercelayer_signature(payload, None, SECRET) is False

    def test_tampered_body_returns_false(self):
        signature = generate_signature(order_payload("yzkWXfWDnu"), SECRET)
        assert verify_commercelayer_signature(order_payload("TAMPERED123"), signature, SECRET) is False

    def test_wrong_secret_returns_false(self):
        payload = order_payload()
        signature = generate_signature(payload, SECRET)
        assert verify_commercelayer_signature(payload, signature, "wrong_secret") is False


class TestCommerceLayerWebhookEndpoint:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/commercelayer",
            content=order_payload(),
            headers={
                "Content-Type": "application/json",
                "X-CommerceLayer-Topic": "orders.place",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/commercelayer",
            content=order_payload(),
            headers={
                "Content-Type": "application/json",
                "X-CommerceLayer-Signature": "invalid",
                "X-CommerceLayer-Topic": "orders.place",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = order_payload()
        signature = generate_signature(payload, SECRET)
        response = client.post(
            "/webhooks/commercelayer",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-CommerceLayer-Signature": signature,
                "X-CommerceLayer-Topic": "orders.place",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_dispatched_topics(self):
        topics = [
            "orders.place",
            "orders.approve",
            "orders.cancel",
            "orders.pay",
            "orders.refund",
            "customers.create",
            "shipments.ship",
            "shipments.deliver",
        ]
        for topic in topics:
            payload = order_payload("abc123")
            signature = generate_signature(payload, SECRET)
            response = client.post(
                "/webhooks/commercelayer",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-CommerceLayer-Signature": signature,
                    "X-CommerceLayer-Topic": topic,
                },
            )
            assert response.status_code == 200, f"Failed for topic: {topic}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
