import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["ASANA_WEBHOOK_SECRET"] = "test_asana_secret"

from main import app, verify_asana_signature

client = TestClient(app)


def generate_asana_signature(payload: str, secret: str) -> str:
    """Generate a valid Asana signature for testing (hex HMAC-SHA256)."""
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


class TestVerifyAsanaSignature:
    """Tests for the Asana signature verification function."""

    secret = os.environ["ASANA_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"events":[]}'
        signature = generate_asana_signature(payload.decode(), self.secret)

        assert verify_asana_signature(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"events":[]}'

        assert verify_asana_signature(payload, "deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"events":[]}'

        assert verify_asana_signature(payload, None, self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"events":[{"action":"added"}]}'
        signature = generate_asana_signature(original.decode(), self.secret)
        tampered = b'{"events":[{"action":"deleted"}]}'

        assert verify_asana_signature(tampered, signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"events":[]}'
        signature = generate_asana_signature(payload.decode(), self.secret)

        assert verify_asana_signature(payload, signature, "wrong_secret") is False


class TestAsanaHandshake:
    """Tests for the handshake phase."""

    def test_echoes_hook_secret_and_returns_200(self):
        response = client.post(
            "/webhooks/asana",
            content="",
            headers={"X-Hook-Secret": "handshake_secret_value"},
        )
        assert response.status_code == 200
        assert response.headers.get("x-hook-secret") == "handshake_secret_value"


class TestAsanaDelivery:
    """Tests for the event delivery phase."""

    secret = os.environ["ASANA_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/asana",
            content='{"events":[]}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        response = client.post(
            "/webhooks/asana",
            content='{"events":[]}',
            headers={
                "Content-Type": "application/json",
                "X-Hook-Signature": "deadbeef",
            },
        )
        assert response.status_code == 401

    def test_valid_heartbeat_returns_200(self):
        payload = '{"events":[]}'
        signature = generate_asana_signature(payload, self.secret)

        response = client.post(
            "/webhooks/asana",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hook-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_event_batch_returns_200(self):
        payload = json.dumps(
            {
                "events": [
                    {
                        "action": "changed",
                        "resource": {"gid": "12345", "resource_type": "task"},
                        "parent": {"gid": "67890", "resource_type": "project"},
                        "user": {"gid": "11111", "resource_type": "user"},
                        "created_at": "2026-07-22T10:00:00.000Z",
                        "change": {"field": "completed", "action": "changed"},
                    }
                ]
            }
        )
        signature = generate_asana_signature(payload, self.secret)

        response = client.post(
            "/webhooks/asana",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hook-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_tampered_body_returns_401(self):
        original = json.dumps({"events": [{"action": "added"}]})
        signature = generate_asana_signature(original, self.secret)
        tampered = json.dumps({"events": [{"action": "deleted"}]})

        response = client.post(
            "/webhooks/asana",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "X-Hook-Signature": signature,
            },
        )
        assert response.status_code == 401


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
