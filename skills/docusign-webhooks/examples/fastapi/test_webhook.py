import os
import json
import hmac
import hashlib
import base64
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["DOCUSIGN_HMAC_SECRET"] = "test_docusign_hmac_secret"

from main import app, verify_docusign_webhook

client = TestClient(app)

SECRET = os.environ["DOCUSIGN_HMAC_SECRET"]


def generate_docusign_signature(payload: str, secret: str) -> str:
    """Generate a valid DocuSign HMAC signature for testing.

    HMAC-SHA256 over the raw body, base64-encoded.
    """
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")


class TestVerifyDocuSignWebhook:
    """Tests for the DocuSign signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = b'{"event":"envelope-completed"}'
        signature = generate_docusign_signature(payload.decode(), SECRET)

        assert verify_docusign_webhook(
            payload, {"x-docusign-signature-1": signature}, SECRET
        ) is True

    def test_any_matching_numbered_header_returns_true(self):
        """Key rotation: only one X-DocuSign-Signature-N needs to match."""
        payload = b'{"event":"envelope-sent"}'
        signature = generate_docusign_signature(payload.decode(), SECRET)

        assert verify_docusign_webhook(
            payload,
            {
                "x-docusign-signature-1": "wrong_key_signature",
                "x-docusign-signature-2": signature,
            },
            SECRET,
        ) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"event":"envelope-completed"}'
        assert verify_docusign_webhook(
            payload, {"x-docusign-signature-1": "invalid"}, SECRET
        ) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"event":"envelope-completed"}'
        assert verify_docusign_webhook(payload, {}, SECRET) is False

    def test_tampered_body_returns_false(self):
        original = b'{"event":"envelope-completed","amount":100}'
        signature = generate_docusign_signature(original.decode(), SECRET)
        tampered = b'{"event":"envelope-completed","amount":999}'

        assert verify_docusign_webhook(
            tampered, {"x-docusign-signature-1": signature}, SECRET
        ) is False


class TestDocuSignWebhook:
    """Tests for the DocuSign webhook endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/docusign",
            content='{"event":"envelope-completed"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"event": "envelope-completed"})
        response = client.post(
            "/webhooks/docusign",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-DocuSign-Signature-1": "invalid_signature",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps({"event": "envelope-completed", "data": {"envelopeId": "abc-123"}})
        signature = generate_docusign_signature(payload, SECRET)

        response = client.post(
            "/webhooks/docusign",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-DocuSign-Signature-1": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_events(self):
        events = [
            "envelope-sent",
            "envelope-delivered",
            "envelope-completed",
            "envelope-declined",
            "envelope-voided",
            "recipient-sent",
            "recipient-delivered",
            "recipient-completed",
            "recipient-declined",
            "recipient-authenticationfailed",
        ]

        for event in events:
            payload = json.dumps({"event": event, "data": {"envelopeId": "abc-123"}})
            signature = generate_docusign_signature(payload, SECRET)

            response = client.post(
                "/webhooks/docusign",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-DocuSign-Signature-1": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event: {event}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
