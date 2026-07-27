import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app.
os.environ["AIPRISE_API_KEY"] = "abcdef12-pqrs-abcd-pqrs-abcde0123456"

from main import app, verify_aiprise_webhook

client = TestClient(app)


def generate_aiprise_signature(payload: str, api_key: str) -> str:
    """Generate a valid AiPrise signature — lowercase hex HMAC-SHA256 over the
    raw body, keyed with the API private key."""
    return hmac.new(
        api_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest().lower()


def approved_payload(**overrides) -> str:
    payload = {
        "verification_session_id": "123408f2-2bbb-415f-aafc-92212341234",
        "template_id": "123456-3434-2342-3453-b4218a4fb333",
        "client_reference_id": None,
        "aiprise_summary": {
            "tags": [],
            "reasons": [],
            "notes": [],
            "verification_result": "APPROVED",
        },
        "created_at": 1668974142818,
    }
    payload.update(overrides)
    return json.dumps(payload)


class TestVerifyAiPriseWebhook:
    """Tests for the AiPrise signature verification function."""

    api_key = os.environ["AIPRISE_API_KEY"]

    def test_valid_signature_returns_true(self):
        payload = approved_payload().encode("utf-8")
        signature = generate_aiprise_signature(payload.decode(), self.api_key)

        assert verify_aiprise_webhook(payload, signature, self.api_key) is True

    def test_uppercase_signature_header_returns_true(self):
        payload = approved_payload().encode("utf-8")
        signature = generate_aiprise_signature(payload.decode(), self.api_key).upper()

        assert verify_aiprise_webhook(payload, signature, self.api_key) is True

    def test_invalid_signature_returns_false(self):
        payload = approved_payload().encode("utf-8")

        assert verify_aiprise_webhook(payload, "deadbeef", self.api_key) is False

    def test_missing_signature_returns_false(self):
        payload = approved_payload().encode("utf-8")

        assert verify_aiprise_webhook(payload, None, self.api_key) is False

    def test_tampered_payload_returns_false(self):
        payload = approved_payload().encode("utf-8")
        signature = generate_aiprise_signature(payload.decode(), self.api_key)
        tampered = approved_payload(verification_session_id="other").encode("utf-8")

        assert verify_aiprise_webhook(tampered, signature, self.api_key) is False

    def test_wrong_key_returns_false(self):
        payload = approved_payload().encode("utf-8")
        signature = generate_aiprise_signature(payload.decode(), self.api_key)

        assert verify_aiprise_webhook(payload, signature, "wrong-key") is False


class TestAiPriseWebhook:
    """Tests for the AiPrise webhook endpoint."""

    api_key = os.environ["AIPRISE_API_KEY"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/aiprise",
            content=approved_payload(),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        response = client.post(
            "/webhooks/aiprise",
            content=approved_payload(),
            headers={
                "Content-Type": "application/json",
                "X-HMAC-SIGNATURE": "deadbeef",
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        payload = approved_payload()
        signature = generate_aiprise_signature(payload, self.api_key)

        response = client.post(
            "/webhooks/aiprise",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-HMAC-SIGNATURE": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    @pytest.mark.parametrize("result", ["APPROVED", "DECLINED", "REVIEW", "UNKNOWN"])
    def test_handles_each_verification_result(self, result):
        payload = approved_payload(
            aiprise_summary={"verification_result": result}
        )
        signature = generate_aiprise_signature(payload, self.api_key)

        response = client.post(
            "/webhooks/aiprise",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-HMAC-SIGNATURE": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
