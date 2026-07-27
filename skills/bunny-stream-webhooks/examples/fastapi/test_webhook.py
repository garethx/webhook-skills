import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["BUNNY_STREAM_WEBHOOK_SECRET"] = "test_read_only_api_key"

from main import app, verify_bunny_stream

client = TestClient(app)


def generate_bunny_signature(payload: str, secret: str) -> str:
    """Generate a valid Bunny Stream signature for testing.

    HMAC-SHA256 over the raw body, keyed on the Read-Only API key, lowercase hex.
    """
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


class TestVerifyBunnyStream:
    """Tests for the Bunny Stream signature verification function."""

    secret = os.environ["BUNNY_STREAM_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"VideoLibraryId":12345,"VideoGuid":"abc","Status":3}'
        signature = generate_bunny_signature(payload.decode(), self.secret)

        assert verify_bunny_stream(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"Status":3}'

        assert verify_bunny_stream(payload, "deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"Status":3}'

        assert verify_bunny_stream(payload, None, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"Status":3}'
        signature = generate_bunny_signature(payload.decode(), self.secret)

        assert verify_bunny_stream(payload, signature, "wrong_secret") is False

    def test_tampered_body_returns_false(self):
        original = b'{"VideoGuid":"abc","Status":3}'
        signature = generate_bunny_signature(original.decode(), self.secret)
        tampered = b'{"VideoGuid":"abc","Status":5}'

        assert verify_bunny_stream(tampered, signature, self.secret) is False


class TestBunnyStreamWebhook:
    """Tests for the Bunny Stream webhook endpoint."""

    secret = os.environ["BUNNY_STREAM_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/bunny-stream",
            content='{"VideoLibraryId":1,"VideoGuid":"abc","Status":3}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"VideoLibraryId": 1, "VideoGuid": "abc", "Status": 3})

        response = client.post(
            "/webhooks/bunny-stream",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-BunnyStream-Signature": "deadbeef",
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {
                "VideoLibraryId": 12345,
                "VideoGuid": "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
                "Status": 3,
            }
        )
        signature = generate_bunny_signature(payload, self.secret)

        response = client.post(
            "/webhooks/bunny-stream",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-BunnyStream-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_failed_status(self):
        payload = json.dumps({"VideoLibraryId": 1, "VideoGuid": "abc", "Status": 5})
        signature = generate_bunny_signature(payload, self.secret)

        response = client.post(
            "/webhooks/bunny-stream",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-BunnyStream-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_captions_generated_status(self):
        payload = json.dumps({"VideoLibraryId": 1, "VideoGuid": "abc", "Status": 9})
        signature = generate_bunny_signature(payload, self.secret)

        response = client.post(
            "/webhooks/bunny-stream",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-BunnyStream-Signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
