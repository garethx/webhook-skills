import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["BRIDGE_WEBHOOK_SECRET"] = "test_bridge_secret"

from main import app, verify_bridge_webhook

client = TestClient(app)


def generate_bridge_signature(payload: str, secret: str) -> str:
    """Generate a valid Bridge API signature header for testing.

    Bridge sends UPPERCASE hex, prefixed with the `v1=` scheme.
    """
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest().upper()
    return f"v1={signature}"


class TestVerifyBridgeWebhook:
    """Tests for the Bridge signature verification function."""

    secret = os.environ["BRIDGE_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"type":"item.refreshed"}'
        signature = generate_bridge_signature(payload.decode(), self.secret)

        assert verify_bridge_webhook(payload, signature, self.secret) is True

    def test_multiple_v1_signatures_rotation(self):
        payload = b'{"type":"item.refreshed"}'
        valid_sig = generate_bridge_signature(payload.decode(), self.secret)
        header = f"v1=DEADBEEF,{valid_sig}"

        assert verify_bridge_webhook(payload, header, self.secret) is True

    def test_non_v1_scheme_ignored(self):
        payload = b'{"type":"item.refreshed"}'
        hex_digest = hmac.new(
            self.secret.encode(), payload, hashlib.sha256
        ).hexdigest().upper()

        assert verify_bridge_webhook(payload, f"v0={hex_digest}", self.secret) is False

    def test_invalid_signature_returns_false(self):
        payload = b'{"type":"item.refreshed"}'

        assert verify_bridge_webhook(payload, "v1=INVALID", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"type":"item.refreshed"}'

        assert verify_bridge_webhook(payload, None, self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"type":"item.refreshed","content":{"item_id":1}}'
        signature = generate_bridge_signature(original.decode(), self.secret)
        tampered = b'{"type":"item.refreshed","content":{"item_id":999}}'

        assert verify_bridge_webhook(tampered, signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"type":"item.refreshed"}'
        signature = generate_bridge_signature(payload.decode(), self.secret)

        assert verify_bridge_webhook(payload, signature, "wrong_secret") is False


class TestBridgeWebhook:
    """Tests for the Bridge webhook endpoint."""

    secret = os.environ["BRIDGE_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/bridge-api",
            content='{"type":"item.refreshed"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"type": "item.refreshed"})

        response = client.post(
            "/webhooks/bridge-api",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "BridgeApi-Signature": "v1=INVALID",
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {
                "type": "item.refreshed",
                "timestamp": 1699999999,
                "content": {"item_id": 12345, "status": 0},
            }
        )
        signature = generate_bridge_signature(payload, self.secret)

        response = client.post(
            "/webhooks/bridge-api",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "BridgeApi-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_test_event(self):
        payload = json.dumps(
            {
                "type": "TEST_EVENT",
                "timestamp": 1699999999,
                "content": {"item_id": 0, "status": 0, "user_uuid": "test-uuid"},
            }
        )
        signature = generate_bridge_signature(payload, self.secret)

        response = client.post(
            "/webhooks/bridge-api",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "BridgeApi-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_payment_transaction_updated(self):
        payload = json.dumps(
            {
                "type": "payment.transaction.updated",
                "timestamp": 1699999999,
                "content": {"transaction_id": "txn_1"},
            }
        )
        signature = generate_bridge_signature(payload, self.secret)

        response = client.post(
            "/webhooks/bridge-api",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "BridgeApi-Signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
