import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["RECHARGE_API_CLIENT_SECRET"] = "test_client_secret"

from main import app, verify_recharge_webhook

client = TestClient(app)


def generate_recharge_signature(payload: bytes, secret: str) -> str:
    """Generate a valid Recharge signature for testing.

    Recharge uses a plain SHA-256 of (secret + raw_body), hex-encoded - NOT HMAC.
    """
    return hashlib.sha256(secret.encode("utf-8") + payload).hexdigest()


class TestVerifyRechargeWebhook:
    """Tests for the Recharge signature verification function."""

    secret = os.environ["RECHARGE_API_CLIENT_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"charge":{"id":123}}'
        signature = generate_recharge_signature(payload, self.secret)

        assert verify_recharge_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"charge":{"id":123}}'

        assert verify_recharge_webhook(payload, "invalid_signature", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"charge":{"id":123}}'

        assert verify_recharge_webhook(payload, "", self.secret) is False

    def test_tampered_body_returns_false(self):
        original = b'{"charge":{"id":123,"total_price":"10.00"}}'
        signature = generate_recharge_signature(original, self.secret)
        tampered = b'{"charge":{"id":123,"total_price":"999.00"}}'

        assert verify_recharge_webhook(tampered, signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"charge":{"id":123}}'
        signature = generate_recharge_signature(payload, self.secret)

        assert verify_recharge_webhook(payload, signature, "wrong_secret") is False

    def test_hmac_signature_does_not_match(self):
        """Recharge is a plain hash, not HMAC - an HMAC digest must be rejected."""
        payload = b'{"charge":{"id":123}}'
        hmac_sig = hmac.new(
            self.secret.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()

        assert verify_recharge_webhook(payload, hmac_sig, self.secret) is False


class TestRechargeWebhook:
    """Tests for the Recharge webhook endpoint."""

    secret = os.environ["RECHARGE_API_CLIENT_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/recharge",
            content='{"charge":{"id":123}}',
            headers={
                "Content-Type": "application/json",
                "X-Recharge-Topic": "charge/paid",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"charge": {"id": 123}})

        response = client.post(
            "/webhooks/recharge",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Recharge-Hmac-Sha256": "invalid_signature",
                "X-Recharge-Topic": "charge/paid",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps({"charge": {"id": 123, "status": "success"}})
        signature = generate_recharge_signature(payload.encode("utf-8"), self.secret)

        response = client.post(
            "/webhooks/recharge",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Recharge-Hmac-Sha256": signature,
                "X-Recharge-Topic": "charge/paid",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_topics(self):
        topics = [
            "charge/created",
            "charge/paid",
            "charge/failed",
            "subscription/created",
            "subscription/cancelled",
            "order/created",
            "order/processed",
            "customer/updated",
        ]

        for topic in topics:
            payload = json.dumps({"charge": {"id": 456}})
            signature = generate_recharge_signature(payload.encode("utf-8"), self.secret)

            response = client.post(
                "/webhooks/recharge",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Recharge-Hmac-Sha256": signature,
                    "X-Recharge-Topic": topic,
                },
            )
            assert response.status_code == 200, f"Failed for topic: {topic}"


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
