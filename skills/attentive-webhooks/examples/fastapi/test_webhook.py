import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["ATTENTIVE_WEBHOOK_SECRET"] = "test_attentive_signing_key"

from main import app, verify_attentive_webhook

client = TestClient(app)


def generate_attentive_signature(payload: str, secret: str) -> str:
    """Generate a valid Attentive signature for testing:
    HMAC-SHA256 over the raw body, hex-encoded.
    """
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


class TestVerifyAttentiveWebhook:
    """Tests for the Attentive signature verification function."""

    secret = os.environ["ATTENTIVE_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"type":"sms.subscribed"}'
        signature = generate_attentive_signature(payload.decode(), self.secret)

        assert verify_attentive_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"type":"sms.subscribed"}'

        assert verify_attentive_webhook(payload, "deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"type":"sms.subscribed"}'

        assert verify_attentive_webhook(payload, None, self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"type":"sms.subscribed","id":1}'
        signature = generate_attentive_signature(original.decode(), self.secret)
        tampered = b'{"type":"sms.subscribed","id":999}'

        assert verify_attentive_webhook(tampered, signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"type":"sms.subscribed"}'
        signature = generate_attentive_signature(payload.decode(), self.secret)

        assert verify_attentive_webhook(payload, signature, "wrong_secret") is False


class TestAttentiveWebhook:
    """Tests for the Attentive webhook endpoint."""

    secret = os.environ["ATTENTIVE_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/attentive",
            content='{"type":"sms.subscribed"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"type": "sms.subscribed"})

        response = client.post(
            "/webhooks/attentive",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-attentive-hmac-sha256": "deadbeef",
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {
                "type": "sms.subscribed",
                "timestamp": 1721664000000,
                "subscriber": {"phone": "+15555550123"},
            }
        )
        signature = generate_attentive_signature(payload, self.secret)

        response = client.post(
            "/webhooks/attentive",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-attentive-hmac-sha256": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_sms_unsubscribed_event(self):
        payload = json.dumps(
            {
                "type": "sms.unsubscribed",
                "timestamp": 1721664000000,
                "subscriber": {"phone": "+15555550123"},
            }
        )
        signature = generate_attentive_signature(payload, self.secret)

        response = client.post(
            "/webhooks/attentive",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-attentive-hmac-sha256": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_email_opened_event(self):
        payload = json.dumps(
            {
                "type": "email.opened",
                "timestamp": 1721664000000,
                "subscriber": {"email": "user@example.com"},
            }
        )
        signature = generate_attentive_signature(payload, self.secret)

        response = client.post(
            "/webhooks/attentive",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-attentive-hmac-sha256": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_custom_attribute_set_event(self):
        payload = json.dumps(
            {
                "type": "custom_attribute.set",
                "timestamp": 1721664000000,
                "subscriber": {"email": "user@example.com"},
            }
        )
        signature = generate_attentive_signature(payload, self.secret)

        response = client.post(
            "/webhooks/attentive",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-attentive-hmac-sha256": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
