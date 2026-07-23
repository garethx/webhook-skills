import os
import json
import hmac
import hashlib
import base64

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app.
os.environ["TALLY_SIGNING_SECRET"] = "test_tally_signing_secret"

from main import app, verify_tally_webhook, get_answer

client = TestClient(app)

SIGNING_SECRET = "test_tally_signing_secret"


def generate_tally_signature(raw_body: bytes, secret: str) -> str:
    """Generate a valid Tally signature: base64(HMAC-SHA256(secret, raw_body))."""
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")


def sample_payload() -> bytes:
    return json.dumps(
        {
            "eventId": "evt_123",
            "eventType": "FORM_RESPONSE",
            "createdAt": "2024-01-01T00:00:00.000Z",
            "data": {
                "responseId": "resp_1",
                "submissionId": "sub_1",
                "respondentId": "rsp_1",
                "formId": "wMKq5R",
                "formName": "Contact form",
                "fields": [
                    {
                        "key": "q1",
                        "label": "Email",
                        "type": "INPUT_EMAIL",
                        "value": "ada@example.com",
                    }
                ],
            },
        }
    ).encode("utf-8")


class TestVerifyTallyWebhook:
    def test_valid_signature_returns_true(self):
        body = sample_payload()
        signature = generate_tally_signature(body, SIGNING_SECRET)
        assert verify_tally_webhook(body, signature, SIGNING_SECRET) is True

    def test_invalid_signature_returns_false(self):
        body = sample_payload()
        assert verify_tally_webhook(body, "invalid", SIGNING_SECRET) is False

    def test_missing_signature_returns_false(self):
        body = sample_payload()
        assert verify_tally_webhook(body, None, SIGNING_SECRET) is False

    def test_tampered_payload_returns_false(self):
        body = sample_payload()
        signature = generate_tally_signature(body, SIGNING_SECRET)
        tampered = body.replace(b"ada@example.com", b"evil@example.com")
        assert verify_tally_webhook(tampered, signature, SIGNING_SECRET) is False

    def test_wrong_secret_returns_false(self):
        body = sample_payload()
        signature = generate_tally_signature(body, SIGNING_SECRET)
        assert verify_tally_webhook(body, signature, "wrong_secret") is False


class TestGetAnswer:
    def test_looks_up_by_label(self):
        fields = [
            {"label": "Email", "value": "ada@example.com"},
            {"label": "Name", "value": "Ada"},
        ]
        assert get_answer(fields, "Email") == "ada@example.com"
        assert get_answer(fields, "Missing") is None


class TestTallyWebhookSigned:
    """Signing secret configured."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/tally",
            content=sample_payload(),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/tally",
            content=sample_payload(),
            headers={
                "Content-Type": "application/json",
                "Tally-Signature": "invalid_signature",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        body = sample_payload()
        signature = generate_tally_signature(body, SIGNING_SECRET)
        response = client.post(
            "/webhooks/tally",
            content=body,
            headers={
                "Content-Type": "application/json",
                "Tally-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}


class TestTallyWebhookUnsigned:
    """No signing secret configured."""

    def setup_method(self):
        self._original = os.environ.pop("TALLY_SIGNING_SECRET", None)

    def teardown_method(self):
        if self._original is not None:
            os.environ["TALLY_SIGNING_SECRET"] = self._original

    def test_unsigned_request_returns_200(self):
        response = client.post(
            "/webhooks/tally",
            content=sample_payload(),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
