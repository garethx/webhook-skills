import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["FAUNDIT_WEBHOOK_SECRET"] = "test_faundit_secret"

from main import app, verify_faundit_webhook

client = TestClient(app)

TIMESTAMP = "1737021000"


def generate_faundit_signature(payload: str, timestamp: str, secret: str) -> str:
    """Generate a valid Faundit v1 signature for testing.

    Signs "v1:<timestamp>:<body>" with HMAC-SHA256 (hex).
    """
    signed_content = f"v1:{timestamp}:{payload}".encode("utf-8")
    return hmac.new(
        secret.encode("utf-8"),
        signed_content,
        hashlib.sha256,
    ).hexdigest()


class TestVerifyFaunditWebhook:
    """Tests for the Faundit signature verification function."""

    secret = os.environ["FAUNDIT_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = '{"event-type":"item-status","data":{"id":1,"status":"delivered"}}'
        signature = generate_faundit_signature(payload, TIMESTAMP, self.secret)

        assert verify_faundit_webhook(
            payload.encode("utf-8"), TIMESTAMP, signature, self.secret
        ) is True

    def test_invalid_signature_returns_false(self):
        payload = '{"event-type":"item-status"}'

        assert verify_faundit_webhook(
            payload.encode("utf-8"), TIMESTAMP, "deadbeef", self.secret
        ) is False

    def test_missing_signature_returns_false(self):
        payload = '{"event-type":"item-status"}'

        assert verify_faundit_webhook(
            payload.encode("utf-8"), TIMESTAMP, None, self.secret
        ) is False

    def test_missing_timestamp_returns_false(self):
        payload = '{"event-type":"item-status"}'
        signature = generate_faundit_signature(payload, TIMESTAMP, self.secret)

        assert verify_faundit_webhook(
            payload.encode("utf-8"), None, signature, self.secret
        ) is False

    def test_tampered_payload_returns_false(self):
        original = '{"event-type":"item-status","data":{"id":1}}'
        signature = generate_faundit_signature(original, TIMESTAMP, self.secret)
        tampered = '{"event-type":"item-status","data":{"id":999}}'

        assert verify_faundit_webhook(
            tampered.encode("utf-8"), TIMESTAMP, signature, self.secret
        ) is False

    def test_wrong_secret_returns_false(self):
        payload = '{"event-type":"item-status"}'
        signature = generate_faundit_signature(payload, TIMESTAMP, self.secret)

        assert verify_faundit_webhook(
            payload.encode("utf-8"), TIMESTAMP, signature, "wrong_secret"
        ) is False


class TestFaunditWebhook:
    """Tests for the Faundit webhook endpoint."""

    secret = os.environ["FAUNDIT_WEBHOOK_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/faundit",
            content='{"event-type":"item-status","data":{"id":1,"status":"delivered"}}',
            headers={
                "Content-Type": "application/json",
                "X-Faundit-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"event-type": "item-status", "data": {"id": 1}})

        response = client.post(
            "/webhooks/faundit",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Faundit-Timestamp": TIMESTAMP,
                "X-Faundit-Signature-Next": "deadbeef",
            },
        )
        assert response.status_code == 400

    def test_valid_item_status_returns_200(self):
        payload = json.dumps({
            "event-type": "item-status",
            "data": {
                "id": 12345,
                "timestamp": "2026-01-15T10:30:00Z",
                "status": "delivered",
                "locationID": "loc_abc123",
            },
        })
        signature = generate_faundit_signature(payload, TIMESTAMP, self.secret)

        response = client.post(
            "/webhooks/faundit",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Faundit-Timestamp": TIMESTAMP,
                "X-Faundit-Signature-Next": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_request_status_returns_200(self):
        payload = json.dumps({
            "event-type": "request-status",
            "data": {
                "id": 678,
                "timestamp": "2026-01-15T10:30:00Z",
                "status": "resolved",
                "locationID": "loc_abc123",
            },
        })
        signature = generate_faundit_signature(payload, TIMESTAMP, self.secret)

        response = client.post(
            "/webhooks/faundit",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Faundit-Timestamp": TIMESTAMP,
                "X-Faundit-Signature-Next": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
