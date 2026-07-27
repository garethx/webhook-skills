import os
import hmac
import hashlib
import json

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["NMI_SIGNING_KEY"] = "test_nmi_signing_key"

from main import app, verify_nmi_webhook

client = TestClient(app)

SIGNING_KEY = os.environ["NMI_SIGNING_KEY"]

SAMPLE_EVENT = {
    "event_id": "b7f1c0d2-3e4a-4b5c-8d6e-7f8091a2b3c4",
    "event_type": "transaction.sale.success",
    "event_body": {
        "merchant": {"merchant_id": "900000", "gateway_id": "12345"},
        "transaction": {
            "transaction_id": "9876543210",
            "transaction_type": "sale",
            "condition": "complete",
            "amount": "49.99",
            "order_id": "ORDER-1001",
        },
    },
}

SAMPLE_BODY = json.dumps(SAMPLE_EVENT)


def sign_body(raw_body: str, nonce: str = "f3c1e9a2b7d84c15", signing_key: str = SIGNING_KEY) -> str:
    """Build a valid NMI Webhook-Signature header for a raw body.

    signature = HMAC-SHA256(signing_key, "<nonce>.<raw_body>"), hex. `t` is a
    nonce (any random-ish string), NOT a timestamp.
    """
    signature = hmac.new(
        signing_key.encode("utf-8"),
        f"{nonce}.{raw_body}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"t={nonce},s={signature}"


class TestVerifyNmiWebhook:
    """Tests for the signature verification function."""

    def test_valid_signature_returns_true(self):
        header = sign_body(SAMPLE_BODY)
        assert verify_nmi_webhook(SAMPLE_BODY.encode("utf-8"), header, SIGNING_KEY) is True

    def test_tampered_body_returns_false(self):
        header = sign_body(SAMPLE_BODY)
        tampered = SAMPLE_BODY.replace("49.99", "9999.99").encode("utf-8")
        assert verify_nmi_webhook(tampered, header, SIGNING_KEY) is False

    def test_wrong_signing_key_returns_false(self):
        header = sign_body(SAMPLE_BODY)
        assert verify_nmi_webhook(SAMPLE_BODY.encode("utf-8"), header, "wrong_key") is False

    def test_altered_nonce_returns_false(self):
        header = sign_body(SAMPLE_BODY, nonce="aaaa1111")
        swapped = header.replace("t=aaaa1111", "t=bbbb2222")
        assert verify_nmi_webhook(SAMPLE_BODY.encode("utf-8"), swapped, SIGNING_KEY) is False

    def test_missing_t_or_s_returns_false(self):
        body = SAMPLE_BODY.encode("utf-8")
        assert verify_nmi_webhook(body, "s=abc123", SIGNING_KEY) is False
        assert verify_nmi_webhook(body, "t=nonce", SIGNING_KEY) is False
        assert verify_nmi_webhook(body, "", SIGNING_KEY) is False

    def test_missing_signing_key_returns_false(self):
        header = sign_body(SAMPLE_BODY)
        assert verify_nmi_webhook(SAMPLE_BODY.encode("utf-8"), header, "") is False


class TestNmiWebhookEndpoint:
    """Tests for the webhook endpoint."""

    def _post(self, body: str, header=None):
        headers = {"Content-Type": "application/json"}
        if header is not None:
            headers["Webhook-Signature"] = header
        return client.post("/webhooks/nmi", content=body, headers=headers)

    def test_valid_signature_returns_200(self):
        response = self._post(SAMPLE_BODY, sign_body(SAMPLE_BODY))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_missing_header_returns_400(self):
        response = self._post(SAMPLE_BODY)
        assert response.status_code == 400

    def test_invalid_signature_returns_401(self):
        response = self._post(SAMPLE_BODY, "t=f3c1e9a2b7d84c15,s=deadbeef")
        assert response.status_code == 401

    def test_tampered_payload_returns_401(self):
        header = sign_body(SAMPLE_BODY)
        tampered = SAMPLE_BODY.replace("transaction.sale.success", "transaction.refund.success")
        response = self._post(tampered, header)
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "action",
        ["sale", "auth", "capture", "void", "refund", "credit", "validate"],
    )
    def test_handles_each_action(self, action):
        body = json.dumps({**SAMPLE_EVENT, "event_type": f"transaction.{action}.success"})
        response = self._post(body, sign_body(body))
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
