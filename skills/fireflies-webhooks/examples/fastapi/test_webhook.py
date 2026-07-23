import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["FIREFLIES_WEBHOOK_SECRET"] = "test_fireflies_secret_1234"

from main import app, verify_fireflies_webhook

client = TestClient(app)


def generate_fireflies_signature(payload: str, secret: str) -> str:
    """Generate a valid Fireflies signature for testing.

    HMAC-SHA256 over the raw body, hex-encoded, no prefix.
    """
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()


class TestVerifyFirefliesWebhook:
    """Tests for the Fireflies signature verification function."""

    secret = os.environ["FIREFLIES_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"meetingId":"abc","eventType":"Transcription completed"}'
        signature = generate_fireflies_signature(payload.decode(), self.secret)

        assert verify_fireflies_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"meetingId":"abc"}'

        assert verify_fireflies_webhook(payload, "deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"meetingId":"abc"}'

        assert verify_fireflies_webhook(payload, None, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"meetingId":"abc"}'
        signature = generate_fireflies_signature(payload.decode(), self.secret)

        assert verify_fireflies_webhook(payload, signature, "wrong_secret") is False

    def test_tampered_payload_returns_false(self):
        original = b'{"meetingId":"abc"}'
        signature = generate_fireflies_signature(original.decode(), self.secret)
        tampered = b'{"meetingId":"xyz"}'

        assert verify_fireflies_webhook(tampered, signature, self.secret) is False

    def test_sha256_prefix_returns_false(self):
        # Fireflies sends a bare hex digest, no "sha256=" prefix
        payload = b'{"meetingId":"abc"}'
        signature = generate_fireflies_signature(payload.decode(), self.secret)

        assert verify_fireflies_webhook(payload, f"sha256={signature}", self.secret) is False


class TestFirefliesWebhook:
    """Tests for the Fireflies webhook endpoint."""

    secret = os.environ["FIREFLIES_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/fireflies",
            content='{"meetingId":"abc","eventType":"Transcription completed"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"meetingId": "abc", "eventType": "Transcription completed"})

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": "deadbeef",
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        payload = json.dumps({
            "meetingId": "01HXXXXXXXXXXXXXXXXXXXXXXX",
            "eventType": "Transcription completed",
        })
        signature = generate_fireflies_signature(payload, self.secret)

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_client_reference_id(self):
        payload = json.dumps({
            "meetingId": "01HXXXXXXXXXXXXXXXXXXXXXXX",
            "eventType": "Transcription completed",
            "clientReferenceId": "upload-42",
        })
        signature = generate_fireflies_signature(payload, self.secret)

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": signature,
            },
        )
        assert response.status_code == 200

    def test_acknowledges_unknown_event_type(self):
        payload = json.dumps({
            "meetingId": "01HXXXXXXXXXXXXXXXXXXXXXXX",
            "eventType": "Some future event",
        })
        signature = generate_fireflies_signature(payload, self.secret)

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
