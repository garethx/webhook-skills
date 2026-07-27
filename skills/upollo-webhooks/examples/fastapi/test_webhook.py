import os
import json
import hmac
import hashlib
import base64
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["UPOLLO_WEBHOOK_SECRET"] = "test_upollo_webhook_secret"

from main import app, verify_upollo_webhook, normalize_enum

client = TestClient(app)


def build_upollo_signature(payload: str, secret: str, encoding: str = "hex", t: int = 1706352000) -> str:
    """Build an Upollo-Signature header for testing.

    Upollo: HMAC-SHA512 of the raw body, keyed with the webhook secret, sent as
    the ``s0`` part alongside a ``t`` timestamp. Docs don't specify hex vs
    base64, so the handler accepts either.
    """
    digest = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha512).digest()
    s0 = base64.b64encode(digest).decode("utf-8") if encoding == "base64" else digest.hex()
    return f"t:{t},s0:{s0}"


FLAGGED_PAYLOAD = json.dumps(
    {
        "action": "CHALLENGE",
        "eventType": "LOGIN",
        "flags": [
            {
                "type": "ACCOUNT_SHARING",
                "firstFlagged": "2026-07-01T12:00:00Z",
                "mostRecentlyFlagged": "2026-07-27T09:00:00Z",
            }
        ],
        "userInfo": {"userId": "user_123", "userEmail": "user@example.com"},
        "deviceInfo": {"deviceId": "dev_abc", "deviceClass": "DEVICE_CLASS_DESKTOP"},
    }
)


class TestVerifyUpolloWebhook:
    """Tests for the Upollo signature verification function."""

    secret = os.environ["UPOLLO_WEBHOOK_SECRET"]

    def test_valid_hex_signature_returns_true(self):
        payload = FLAGGED_PAYLOAD.encode()
        signature = build_upollo_signature(FLAGGED_PAYLOAD, self.secret, "hex")

        assert verify_upollo_webhook(payload, signature, self.secret) is True

    def test_valid_base64_signature_returns_true(self):
        payload = FLAGGED_PAYLOAD.encode()
        signature = build_upollo_signature(FLAGGED_PAYLOAD, self.secret, "base64")

        assert verify_upollo_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = FLAGGED_PAYLOAD.encode()

        assert verify_upollo_webhook(payload, "t:1706352000,s0:deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = FLAGGED_PAYLOAD.encode()

        assert verify_upollo_webhook(payload, None, self.secret) is False

    def test_missing_s0_part_returns_false(self):
        payload = FLAGGED_PAYLOAD.encode()

        assert verify_upollo_webhook(payload, "t:1706352000", self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = '{"userInfo":{"userId":"user_123"}}'
        signature = build_upollo_signature(original, self.secret)

        assert verify_upollo_webhook(b'{"userInfo":{"userId":"attacker"}}', signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = FLAGGED_PAYLOAD.encode()
        signature = build_upollo_signature(FLAGGED_PAYLOAD, self.secret)

        assert verify_upollo_webhook(payload, signature, "wrong_secret") is False

    def test_sha256_digest_returns_false(self):
        payload = FLAGGED_PAYLOAD.encode()
        sha256 = hmac.new(self.secret.encode(), payload, hashlib.sha256).hexdigest()

        assert verify_upollo_webhook(payload, f"t:1706352000,s0:{sha256}", self.secret) is False


class TestNormalizeEnum:
    def test_strips_prefixes(self):
        assert normalize_enum("OUTCOME_CHALLENGE") == "CHALLENGE"
        assert normalize_enum("EVENT_TYPE_LOGIN") == "LOGIN"
        assert normalize_enum("FLAG_TYPE_UNSPECIFIED") == "UNSPECIFIED"

    def test_leaves_short_form_unchanged(self):
        assert normalize_enum("ACCOUNT_SHARING") == "ACCOUNT_SHARING"
        assert normalize_enum("CHALLENGE") == "CHALLENGE"


class TestUpolloWebhook:
    """Tests for the Upollo webhook endpoint."""

    secret = os.environ["UPOLLO_WEBHOOK_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/upollo",
            content=FLAGGED_PAYLOAD,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/upollo",
            content=FLAGGED_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "Upollo-Signature": "t:1706352000,s0:deadbeef",
            },
        )
        assert response.status_code == 400

    def test_valid_account_sharing_challenge_returns_200(self):
        signature = build_upollo_signature(FLAGGED_PAYLOAD, self.secret)

        response = client.post(
            "/webhooks/upollo",
            content=FLAGGED_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "Upollo-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_base64_signature_returns_200(self):
        signature = build_upollo_signature(FLAGGED_PAYLOAD, self.secret, "base64")

        response = client.post(
            "/webhooks/upollo",
            content=FLAGGED_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "Upollo-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_multiple_accounts_deny_with_prefixed_enums(self):
        payload = json.dumps(
            {
                "action": "OUTCOME_DENY",
                "eventType": "EVENT_TYPE_REGISTER",
                "flags": [{"type": "MULTIPLE_ACCOUNTS"}],
                "userInfo": {"userId": "user_777"},
            }
        )
        signature = build_upollo_signature(payload, self.secret)

        response = client.post(
            "/webhooks/upollo",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Upollo-Signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
