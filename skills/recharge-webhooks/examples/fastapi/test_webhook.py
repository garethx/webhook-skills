import os
import json
import time
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["RECHARGE_API_CLIENT_SECRET"] = "test_client_secret"

from main import (
    app,
    verify_recharge_webhook_timestamped,
    verify_recharge_webhook_legacy,
    TIMESTAMP_TOLERANCE_SECONDS,
)

client = TestClient(app)


def generate_timestamped_signature(payload: bytes, secret: str, timestamp: int) -> str:
    """Generate a valid timestamp-bound signature header for testing.

    HMAC-SHA-256 over "<timestamp>.<payload>", keyed by the client secret,
    delivered as `t=<epoch>,v1=<hex>`.
    """
    digest = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.".encode("utf-8") + payload,
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


def generate_legacy_signature(payload: bytes, secret: str) -> str:
    """Generate a valid legacy Recharge signature for testing.

    The legacy scheme is a plain SHA-256 of (secret + raw_body), hex-encoded - NOT HMAC.
    """
    return hashlib.sha256(secret.encode("utf-8") + payload).hexdigest()


class TestVerifyRechargeWebhookTimestamped:
    """Tests for the recommended timestamp-bound verification function."""

    secret = os.environ["RECHARGE_API_CLIENT_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"charge":{"id":123}}'
        header = generate_timestamped_signature(payload, self.secret, int(time.time()))

        assert verify_recharge_webhook_timestamped(payload, header, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"charge":{"id":123}}'
        header = f"t={int(time.time())},v1={'0' * 64}"

        assert verify_recharge_webhook_timestamped(payload, header, self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"charge":{"id":123}}'

        assert verify_recharge_webhook_timestamped(payload, "", self.secret) is False

    def test_malformed_header_returns_false(self):
        payload = b'{"charge":{"id":123}}'

        assert (
            verify_recharge_webhook_timestamped(payload, "not-a-signature", self.secret)
            is False
        )

    def test_expired_timestamp_returns_false(self):
        """Deliveries older than 48 hours must be rejected (replay protection)."""
        payload = b'{"charge":{"id":123}}'
        expired = int(time.time()) - TIMESTAMP_TOLERANCE_SECONDS - 1
        header = generate_timestamped_signature(payload, self.secret, expired)

        assert verify_recharge_webhook_timestamped(payload, header, self.secret) is False

    def test_timestamp_inside_window_returns_true(self):
        payload = b'{"charge":{"id":123}}'
        recent = int(time.time()) - 172000  # inside the 48-hour window
        header = generate_timestamped_signature(payload, self.secret, recent)

        assert verify_recharge_webhook_timestamped(payload, header, self.secret) is True

    def test_tampered_body_returns_false(self):
        original = b'{"charge":{"id":123,"total_price":"10.00"}}'
        header = generate_timestamped_signature(original, self.secret, int(time.time()))
        tampered = b'{"charge":{"id":123,"total_price":"999.00"}}'

        assert verify_recharge_webhook_timestamped(tampered, header, self.secret) is False

    def test_tampered_timestamp_returns_false(self):
        payload = b'{"charge":{"id":123}}'
        now = int(time.time())
        header = generate_timestamped_signature(payload, self.secret, now)
        tampered = header.replace(f"t={now}", f"t={now - 60}", 1)

        assert verify_recharge_webhook_timestamped(payload, tampered, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"charge":{"id":123}}'
        header = generate_timestamped_signature(payload, self.secret, int(time.time()))

        assert verify_recharge_webhook_timestamped(payload, header, "wrong_secret") is False


class TestVerifyRechargeWebhookLegacy:
    """Tests for the legacy body-only verification function."""

    secret = os.environ["RECHARGE_API_CLIENT_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"charge":{"id":123}}'
        signature = generate_legacy_signature(payload, self.secret)

        assert verify_recharge_webhook_legacy(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"charge":{"id":123}}'

        assert (
            verify_recharge_webhook_legacy(payload, "invalid_signature", self.secret)
            is False
        )

    def test_missing_signature_returns_false(self):
        payload = b'{"charge":{"id":123}}'

        assert verify_recharge_webhook_legacy(payload, "", self.secret) is False

    def test_tampered_body_returns_false(self):
        original = b'{"charge":{"id":123,"total_price":"10.00"}}'
        signature = generate_legacy_signature(original, self.secret)
        tampered = b'{"charge":{"id":123,"total_price":"999.00"}}'

        assert verify_recharge_webhook_legacy(tampered, signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"charge":{"id":123}}'
        signature = generate_legacy_signature(payload, self.secret)

        assert verify_recharge_webhook_legacy(payload, signature, "wrong_secret") is False

    def test_hmac_signature_does_not_match(self):
        """Legacy Recharge is a plain hash, not HMAC - an HMAC digest must be rejected."""
        payload = b'{"charge":{"id":123}}'
        hmac_sig = hmac.new(
            self.secret.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()

        assert verify_recharge_webhook_legacy(payload, hmac_sig, self.secret) is False


class TestRechargeWebhook:
    """Tests for the Recharge webhook endpoint."""

    secret = os.environ["RECHARGE_API_CLIENT_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/recharge",
            content='{"charge":{"id":123}}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_valid_timestamped_signature_returns_200(self):
        payload = json.dumps({"charge": {"id": 123, "status": "success"}})
        header = generate_timestamped_signature(
            payload.encode("utf-8"), self.secret, int(time.time())
        )

        response = client.post(
            "/webhooks/recharge",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Recharge-Webhook-Signature": header,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_invalid_timestamped_signature_returns_400(self):
        response = client.post(
            "/webhooks/recharge",
            content='{"charge":{"id":123}}',
            headers={
                "Content-Type": "application/json",
                "X-Recharge-Webhook-Signature": f"t={int(time.time())},v1={'0' * 64}",
            },
        )
        assert response.status_code == 400

    def test_expired_timestamp_returns_400(self):
        payload = '{"charge":{"id":123}}'
        expired = int(time.time()) - TIMESTAMP_TOLERANCE_SECONDS - 1
        header = generate_timestamped_signature(
            payload.encode("utf-8"), self.secret, expired
        )

        response = client.post(
            "/webhooks/recharge",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Recharge-Webhook-Signature": header,
            },
        )
        assert response.status_code == 400

    def test_no_legacy_fallback_when_new_header_invalid(self):
        """An invalid new-scheme header must fail even with a valid legacy header."""
        payload = '{"charge":{"id":123}}'
        legacy_signature = generate_legacy_signature(payload.encode("utf-8"), self.secret)

        response = client.post(
            "/webhooks/recharge",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Recharge-Webhook-Signature": f"t={int(time.time())},v1={'0' * 64}",
                "X-Recharge-Hmac-Sha256": legacy_signature,
            },
        )
        assert response.status_code == 400

    def test_valid_legacy_signature_returns_200(self):
        payload = json.dumps({"charge": {"id": 123, "status": "success"}})
        signature = generate_legacy_signature(payload.encode("utf-8"), self.secret)

        response = client.post(
            "/webhooks/recharge",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Recharge-Hmac-Sha256": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_invalid_legacy_signature_returns_400(self):
        payload = json.dumps({"charge": {"id": 123}})

        response = client.post(
            "/webhooks/recharge",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Recharge-Hmac-Sha256": "invalid_signature",
            },
        )
        assert response.status_code == 400

    def test_dispatches_on_payload_resource_key(self):
        payloads = [
            {"charge": {"id": 456}},
            {"subscription": {"id": 456}},
            {"order": {"id": 456}},
            {"customer": {"id": 456}},
            {"address": {"id": 456}},
        ]

        for body in payloads:
            payload = json.dumps(body)
            header = generate_timestamped_signature(
                payload.encode("utf-8"), self.secret, int(time.time())
            )

            response = client.post(
                "/webhooks/recharge",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Recharge-Webhook-Signature": header,
                },
            )
            assert response.status_code == 200, f"Failed for payload: {body}"

    def test_unrecognized_resource_key_returns_200(self):
        payload = json.dumps({"something_new": {"id": 789}})
        header = generate_timestamped_signature(
            payload.encode("utf-8"), self.secret, int(time.time())
        )

        response = client.post(
            "/webhooks/recharge",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Recharge-Webhook-Signature": header,
            },
        )
        assert response.status_code == 200


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
