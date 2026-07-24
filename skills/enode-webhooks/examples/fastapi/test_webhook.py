import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["ENODE_WEBHOOK_SECRET"] = "test_enode_secret"

from main import app, verify_enode_webhook

client = TestClient(app)


def generate_enode_signature(payload: str, secret: str) -> str:
    """Generate a valid Enode signature for testing (HMAC-SHA1, hex, sha1= prefix)."""
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha1,
    ).hexdigest()
    return f"sha1={signature}"


class TestVerifyEnodeWebhook:
    """Tests for the Enode signature verification function."""

    secret = os.environ["ENODE_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'[{"event":"user:vehicle:updated"}]'
        signature = generate_enode_signature(payload.decode(), self.secret)

        assert verify_enode_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'[{"event":"user:vehicle:updated"}]'

        assert verify_enode_webhook(payload, "sha1=invalid", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'[{"event":"user:vehicle:updated"}]'

        assert verify_enode_webhook(payload, None, self.secret) is False

    def test_sha256_prefixed_signature_returns_false(self):
        payload = b'[{"event":"user:vehicle:updated"}]'
        wrong = "sha256=" + hmac.new(
            self.secret.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()

        assert verify_enode_webhook(payload, wrong, self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = b'[{"event":"user:vehicle:updated","vehicle":{"id":"1"}}]'
        signature = generate_enode_signature(original.decode(), self.secret)
        tampered = b'[{"event":"user:vehicle:updated","vehicle":{"id":"999"}}]'

        assert verify_enode_webhook(tampered, signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'[{"event":"user:vehicle:updated"}]'
        signature = generate_enode_signature(payload.decode(), self.secret)

        assert verify_enode_webhook(payload, signature, "wrong_secret") is False


class TestEnodeWebhook:
    """Tests for the Enode webhook endpoint."""

    secret = os.environ["ENODE_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/enode",
            content='[{"event":"user:vehicle:updated"}]',
            headers={
                "Content-Type": "application/json",
                "X-Enode-Delivery": "test-delivery-id",
            },
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps([{"event": "user:vehicle:updated"}])

        response = client.post(
            "/webhooks/enode",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Enode-Signature": "sha1=invalid",
                "X-Enode-Delivery": "test-delivery-id",
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        payload = json.dumps([
            {
                "event": "user:vehicle:updated",
                "createdAt": "2020-04-07T17:04:26Z",
                "user": {"id": "user-1"},
                "vehicle": {"id": "vehicle-1"},
            }
        ])
        signature = generate_enode_signature(payload, self.secret)

        response = client.post(
            "/webhooks/enode",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Enode-Signature": signature,
                "X-Enode-Delivery": "test-delivery-id",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_test_event(self):
        payload = json.dumps([
            {"event": "enode:webhook:test", "createdAt": "2020-04-07T17:04:26Z"}
        ])
        signature = generate_enode_signature(payload, self.secret)

        response = client.post(
            "/webhooks/enode",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Enode-Signature": signature,
                "X-Enode-Delivery": "test-delivery-id",
            },
        )
        assert response.status_code == 200

    def test_handles_multiple_events(self):
        payload = json.dumps([
            {"event": "user:vehicle:updated", "vehicle": {"id": "v1"}},
            {"event": "user:charger:updated", "charger": {"id": "c1"}},
            {"event": "system:heartbeat", "createdAt": "2020-04-07T17:04:26Z"},
        ])
        signature = generate_enode_signature(payload, self.secret)

        response = client.post(
            "/webhooks/enode",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Enode-Signature": signature,
                "X-Enode-Delivery": "test-delivery-id",
            },
        )
        assert response.status_code == 200

    def test_non_array_body_returns_400(self):
        payload = json.dumps({"event": "user:vehicle:updated"})
        signature = generate_enode_signature(payload, self.secret)

        response = client.post(
            "/webhooks/enode",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Enode-Signature": signature,
                "X-Enode-Delivery": "test-delivery-id",
            },
        )
        assert response.status_code == 400


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
