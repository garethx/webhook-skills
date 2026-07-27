import os
import json
import base64

import pytest
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

# Generate a real Ed25519 key pair and expose the public key (base64url, no
# padding) via the env var main.py reads — BEFORE importing the app.
_private_key = Ed25519PrivateKey.generate()
_public_raw = _private_key.public_key().public_bytes(
    Encoding.Raw, PublicFormat.Raw
)
PUBLIC_KEY_B64URL = base64.urlsafe_b64encode(_public_raw).rstrip(b"=").decode("ascii")
os.environ["TOKEN_WEBHOOK_PUBLIC_KEY"] = PUBLIC_KEY_B64URL

from main import app, verify_token_webhook

client = TestClient(app)

SAMPLE_PAYMENT = {
    "payment": {
        "id": "a4hV9mQ2Zx7",
        "memberId": "m:3xamp1e:5tuv",
        "status": "INITIATION_COMPLETED",
        "bankPaymentStatus": "ACSC",
        "bankPaymentId": "bank-ref-0001",
        "createdDateTime": "2026-07-27T10:00:00Z",
        "updatedDateTime": "2026-07-27T10:01:12Z",
    }
}


def sign(raw_body: bytes, key: Ed25519PrivateKey = _private_key) -> str:
    """Sign a raw body exactly as Token.io would: Ed25519, base64url encoded."""
    return base64.urlsafe_b64encode(key.sign(raw_body)).rstrip(b"=").decode("ascii")


class TestVerifyTokenWebhook:
    """Tests for the Ed25519 verification function."""

    def test_valid_signature_returns_true(self):
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        assert verify_token_webhook(body, sign(body), PUBLIC_KEY_B64URL) is True

    def test_tampered_body_returns_false(self):
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        signature = sign(body)
        tampered = body.replace(b"INITIATION_COMPLETED", b"INITIATION_REJECTED")
        assert verify_token_webhook(tampered, signature, PUBLIC_KEY_B64URL) is False

    def test_different_key_returns_false(self):
        other_key = Ed25519PrivateKey.generate()
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        assert (
            verify_token_webhook(body, sign(body, other_key), PUBLIC_KEY_B64URL)
            is False
        )

    def test_missing_signature_returns_false(self):
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        assert verify_token_webhook(body, None, PUBLIC_KEY_B64URL) is False

    def test_missing_public_key_returns_false(self):
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        assert verify_token_webhook(body, sign(body), None) is False

    def test_malformed_signature_returns_false(self):
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        assert verify_token_webhook(body, "not-a-real-signature", PUBLIC_KEY_B64URL) is False


class TestTokenWebhookEndpoint:
    """Tests for the webhook endpoint."""

    def _post(self, body: bytes, signature=None, event="PAYMENT_STATUS_CHANGED"):
        headers = {"Content-Type": "application/json"}
        if signature is not False:
            headers["token-signature"] = signature or sign(body)
        if event is not None:
            headers["token-event"] = event
        return client.post("/webhooks/tokenio", content=body, headers=headers)

    def test_valid_signature_returns_200(self):
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        response = self._post(body)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_invalid_signature_returns_400(self):
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        other = json.dumps({"payment": {"id": "other"}}).encode("utf-8")
        response = self._post(body, signature=sign(other))
        assert response.status_code == 400

    def test_missing_signature_returns_400(self):
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        response = self._post(body, signature=False)
        assert response.status_code == 400

    def test_tampered_payload_returns_400(self):
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        signature = sign(body)
        tampered = body.replace(b"ACSC", b"RJCT")
        response = self._post(tampered, signature=signature)
        assert response.status_code == 400

    @pytest.mark.parametrize(
        "event",
        [
            "PAYMENT_STATUS_CHANGED",
            "TRANSFER_STATUS_CHANGED",
            "REFUND_STATUS_CHANGED",
            "VRP_STATUS_CHANGED",
            "VRP_CONSENT_STATUS_CHANGED",
            "VIRTUAL_ACCOUNT_CREDIT_RECEIVED",
            "PAYOUT_STATUS_CHANGED",
        ],
    )
    def test_handles_each_event(self, event):
        body = json.dumps(SAMPLE_PAYMENT).encode("utf-8")
        response = self._post(body, event=event)
        assert response.status_code == 200

    @pytest.mark.parametrize(
        "status",
        [
            "INITIATION_PROCESSING",
            "INITIATION_COMPLETED",
            "INITIATION_REJECTED",
            "SUCCESS",
        ],
    )
    def test_handles_each_payment_status(self, status):
        payment = {"payment": {**SAMPLE_PAYMENT["payment"], "status": status}}
        body = json.dumps(payment).encode("utf-8")
        response = self._post(body)
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
