import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["UBER_CLIENT_SECRET"] = "test_client_secret"

from main import app, verify_uber_webhook

client = TestClient(app)


def generate_uber_signature(payload: str, secret: str) -> str:
    """Generate a valid Uber signature for testing.

    Lowercased hex HMAC-SHA256 of the raw body, keyed with the client secret.
    """
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


class TestVerifyUberWebhook:
    """Tests for the Uber signature verification function."""

    secret = os.environ["UBER_CLIENT_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"event_type":"orders.notification"}'
        signature = generate_uber_signature(payload.decode(), self.secret)

        assert verify_uber_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"event_type":"orders.notification"}'

        assert verify_uber_webhook(payload, "deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"event_type":"orders.notification"}'

        assert verify_uber_webhook(payload, None, self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"event_type":"orders.notification"}'
        signature = generate_uber_signature(original.decode(), self.secret)
        tampered = b'{"event_type":"orders.cancel"}'

        assert verify_uber_webhook(tampered, signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"event_type":"orders.notification"}'
        signature = generate_uber_signature(payload.decode(), self.secret)

        assert verify_uber_webhook(payload, signature, "wrong_secret") is False


class TestUberWebhookEndpoint:
    """Tests for the Uber webhook endpoint."""

    secret = os.environ["UBER_CLIENT_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/uber",
            content='{"event_type":"orders.notification"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"event_type": "orders.notification"})

        response = client.post(
            "/webhooks/uber",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Uber-Signature": "deadbeef",
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200_empty_body(self):
        payload = json.dumps({
            "event_id": "evt_1",
            "event_type": "orders.notification",
            "resource_href": "https://api.uber.com/v2/eats/order/abc",
        })
        signature = generate_uber_signature(payload, self.secret)

        response = client.post(
            "/webhooks/uber",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Uber-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.text == ""

    def test_handles_orders_cancel_event(self):
        payload = json.dumps({
            "event_id": "evt_2",
            "event_type": "orders.cancel",
            "resource_href": "https://api.uber.com/v2/eats/order/abc",
        })
        signature = generate_uber_signature(payload, self.secret)

        response = client.post(
            "/webhooks/uber",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Uber-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_store_provisioned_event(self):
        payload = json.dumps({
            "event_id": "evt_3",
            "event_type": "store.provisioned",
            "meta": {"resource_id": "store_123"},
        })
        signature = generate_uber_signature(payload, self.secret)

        response = client.post(
            "/webhooks/uber",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Uber-Signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
