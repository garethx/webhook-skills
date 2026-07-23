import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["NUVEMSHOP_CLIENT_SECRET"] = "test_client_secret"

from main import app, verify_nuvemshop_webhook

client = TestClient(app)


def generate_nuvemshop_signature(payload: str, secret: str) -> str:
    """Generate a valid Nuvemshop HMAC-SHA256 (hex) signature for testing."""
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


class TestVerifyNuvemshopWebhook:
    """Tests for the Nuvemshop signature verification function."""

    secret = os.environ["NUVEMSHOP_CLIENT_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"store_id":123,"event":"order/created","id":999}'
        signature = generate_nuvemshop_signature(payload.decode(), self.secret)

        assert verify_nuvemshop_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"store_id":123,"event":"order/created","id":999}'

        assert verify_nuvemshop_webhook(payload, "deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"store_id":123}'

        assert verify_nuvemshop_webhook(payload, "", self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"store_id":123,"event":"order/paid","id":1}'
        signature = generate_nuvemshop_signature(original.decode(), self.secret)
        tampered = b'{"store_id":123,"event":"order/paid","id":2}'

        assert verify_nuvemshop_webhook(tampered, signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"store_id":123}'
        signature = generate_nuvemshop_signature(payload.decode(), self.secret)

        assert verify_nuvemshop_webhook(payload, signature, "wrong_secret") is False


class TestNuvemshopWebhook:
    """Tests for the Nuvemshop webhook endpoint."""

    secret = os.environ["NUVEMSHOP_CLIENT_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/nuvemshop",
            content='{"store_id":123,"event":"order/created","id":999}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"store_id": 123, "event": "order/created", "id": 999})

        response = client.post(
            "/webhooks/nuvemshop",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-linkedstore-hmac-sha256": "deadbeef",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps({"store_id": 123, "event": "order/created", "id": 999})
        signature = generate_nuvemshop_signature(payload, self.secret)

        response = client.post(
            "/webhooks/nuvemshop",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-linkedstore-hmac-sha256": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_events(self):
        events = [
            "order/created",
            "order/paid",
            "order/cancelled",
            "order/updated",
            "order/fulfilled",
            "product/created",
            "product/updated",
            "product/deleted",
            "customer/created",
            "app/uninstalled",
        ]

        for event in events:
            payload = json.dumps({"store_id": 123, "event": event, "id": 456})
            signature = generate_nuvemshop_signature(payload, self.secret)

            response = client.post(
                "/webhooks/nuvemshop",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-linkedstore-hmac-sha256": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event: {event}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
