import os
import json
import hmac
import hashlib
import base64
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["CLIO_WEBHOOK_SECRET"] = "test_clio_shared_secret"

from main import app, verify_clio_webhook

client = TestClient(app)


def generate_clio_signature(payload: str, secret: str, encoding: str = "hex") -> str:
    """Generate a valid Clio signature for testing.

    Clio: HMAC-SHA256 of the raw body, keyed with the shared secret. Clio's docs
    do not specify hex vs base64, so the handler accepts either.
    """
    digest = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    if encoding == "base64":
        return base64.b64encode(digest).decode("utf-8")
    return digest.hex()


class TestVerifyClioWebhook:
    """Tests for the Clio signature verification function."""

    secret = os.environ["CLIO_WEBHOOK_SECRET"]

    def test_valid_hex_signature_returns_true(self):
        payload = b'{"meta":{"event":"created"}}'
        signature = generate_clio_signature(payload.decode(), self.secret, "hex")

        assert verify_clio_webhook(payload, signature, self.secret) is True

    def test_valid_base64_signature_returns_true(self):
        payload = b'{"meta":{"event":"created"}}'
        signature = generate_clio_signature(payload.decode(), self.secret, "base64")

        assert verify_clio_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"meta":{"event":"created"}}'

        assert verify_clio_webhook(payload, "deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"meta":{"event":"created"}}'

        assert verify_clio_webhook(payload, None, self.secret) is False

    def test_tampered_payload_returns_false(self):
        signature = generate_clio_signature('{"data":{"id":1}}', self.secret)

        assert verify_clio_webhook(b'{"data":{"id":999}}', signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"meta":{"event":"created"}}'
        signature = generate_clio_signature(payload.decode(), self.secret)

        assert verify_clio_webhook(payload, signature, "wrong_secret") is False


class TestClioHandshake:
    """Tests for the X-Hook-Secret activation handshake."""

    def test_handshake_echoes_secret_and_returns_200(self):
        secret = "handshake_secret_from_clio"

        response = client.post(
            "/webhooks/clio",
            content="",
            headers={"X-Hook-Secret": secret},
        )
        assert response.status_code == 200
        assert response.headers.get("x-hook-secret") == secret


class TestClioWebhook:
    """Tests for the Clio webhook event endpoint."""

    secret = os.environ["CLIO_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/clio",
            content='{"meta":{"event":"created"}}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"meta": {"event": "created"}})

        response = client.post(
            "/webhooks/clio",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hook-Signature": "deadbeef",
            },
        )
        assert response.status_code == 401

    def test_valid_created_event_returns_200(self):
        payload = json.dumps(
            {"data": {"id": 152, "etag": '"abc"'}, "meta": {"event": "created", "webhook_id": 1234}}
        )
        signature = generate_clio_signature(payload, self.secret)

        response = client.post(
            "/webhooks/clio",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hook-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_base64_signature_returns_200(self):
        payload = json.dumps({"data": {"id": 152}, "meta": {"event": "created", "webhook_id": 1234}})
        signature = generate_clio_signature(payload, self.secret, "base64")

        response = client.post(
            "/webhooks/clio",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hook-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_matter_closed_event(self):
        payload = json.dumps({"data": {"id": 77}, "meta": {"event": "matter_closed", "webhook_id": 1234}})
        signature = generate_clio_signature(payload, self.secret)

        response = client.post(
            "/webhooks/clio",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hook-Signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
