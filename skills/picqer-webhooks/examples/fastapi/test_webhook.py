import os
import json
import hmac
import hashlib
import base64
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["PICQER_WEBHOOK_SECRET"] = "test_picqer_secret"

from main import app, verify_picqer_webhook

client = TestClient(app)


def generate_picqer_signature(payload: str, secret: str) -> str:
    """Generate a valid Picqer HMAC signature for testing.

    Mirrors Picqer: base64(HMAC-SHA256(rawBody, secret)).
    """
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")


class TestVerifyPicqerWebhook:
    """Tests for the Picqer signature verification function."""

    secret = os.environ["PICQER_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"event":"orders.completed"}'
        signature = generate_picqer_signature(payload.decode(), self.secret)

        assert verify_picqer_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"event":"orders.completed"}'

        assert verify_picqer_webhook(payload, "invalid_signature", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"event":"orders.completed"}'

        assert verify_picqer_webhook(payload, None, self.secret) is False

    def test_missing_secret_returns_false(self):
        payload = b'{"event":"orders.completed"}'
        signature = generate_picqer_signature(payload.decode(), self.secret)

        assert verify_picqer_webhook(payload, signature, None) is False

    def test_tampered_payload_returns_false(self):
        original = '{"event":"orders.completed","data":{"idorder":1}}'
        signature = generate_picqer_signature(original, self.secret)
        tampered = b'{"event":"orders.completed","data":{"idorder":999}}'

        assert verify_picqer_webhook(tampered, signature, self.secret) is False


class TestPicqerWebhook:
    """Tests for the Picqer webhook endpoint."""

    secret = os.environ["PICQER_WEBHOOK_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/picqer",
            content='{"event":"orders.completed"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"event": "orders.completed"})

        response = client.post(
            "/webhooks/picqer",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Picqer-Signature": "invalid_signature",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {
                "idhook": 12345,
                "name": "My hook",
                "event": "orders.completed",
                "event_triggered_at": "2026-07-22 10:30:00",
                "data": {"idorder": 42},
            }
        )
        signature = generate_picqer_signature(payload, self.secret)

        response = client.post(
            "/webhooks/picqer",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Picqer-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_events(self):
        events = [
            "orders.created",
            "orders.completed",
            "orders.status_changed",
            "picklists.created",
            "picklists.closed",
            "picklists.shipments.created",
            "products.created",
            "products.stock_changed",
            "purchase_orders.created",
            "returns.created",
        ]

        for event in events:
            payload = json.dumps({"event": event, "data": {"idorder": 1}})
            signature = generate_picqer_signature(payload, self.secret)

            response = client.post(
                "/webhooks/picqer",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Picqer-Signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event: {event}"


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
