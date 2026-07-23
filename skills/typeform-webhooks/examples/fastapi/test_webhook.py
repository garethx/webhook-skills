import os
import json
import hmac
import hashlib
import base64

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["TYPEFORM_WEBHOOK_SECRET"] = "test_typeform_secret"

from main import app, verify_typeform_signature

client = TestClient(app)

SECRET = os.environ["TYPEFORM_WEBHOOK_SECRET"]

SAMPLE_PAYLOAD = json.dumps(
    {
        "event_id": "01F5N",
        "event_type": "form_response",
        "form_response": {
            "form_id": "lT4Z3j",
            "token": "a3a12ec67a1365927098a606107fac15",
            "submitted_at": "2026-07-22T14:05:00Z",
            "answers": [
                {"type": "email", "email": "jane@example.com", "field": {"id": "abc", "type": "email"}}
            ],
        },
    }
)


def generate_typeform_signature(payload: str, secret: str) -> str:
    """Generate a valid Typeform signature: 'sha256=' + base64(HMAC-SHA256)."""
    digest = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return "sha256=" + base64.b64encode(digest).decode("utf-8")


class TestVerifyTypeformSignature:
    """Tests for the Typeform signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = b'{"event_type":"form_response"}'
        signature = generate_typeform_signature(payload.decode(), SECRET)

        assert verify_typeform_signature(payload, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"event_type":"form_response"}'

        assert verify_typeform_signature(payload, "sha256=invalid", SECRET) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"event_type":"form_response"}'

        assert verify_typeform_signature(payload, None, SECRET) is False

    def test_missing_prefix_returns_false(self):
        payload = b'{"event_type":"form_response"}'
        bare = base64.b64encode(
            hmac.new(SECRET.encode(), payload, hashlib.sha256).digest()
        ).decode()

        assert verify_typeform_signature(payload, bare, SECRET) is False

    def test_tampered_payload_returns_false(self):
        original = SAMPLE_PAYLOAD.encode()
        signature = generate_typeform_signature(SAMPLE_PAYLOAD, SECRET)
        tampered = SAMPLE_PAYLOAD.replace("jane@example.com", "evil@example.com").encode()

        assert verify_typeform_signature(tampered, signature, SECRET) is False


class TestTypeformWebhook:
    """Tests for the Typeform webhook endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/typeform",
            content=SAMPLE_PAYLOAD,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/typeform",
            content=SAMPLE_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "Typeform-Signature": "sha256=invalid",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        signature = generate_typeform_signature(SAMPLE_PAYLOAD, SECRET)

        response = client.post(
            "/webhooks/typeform",
            content=SAMPLE_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "Typeform-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_both_event_types(self):
        for event_type in ["form_response", "form_response_partial"]:
            payload = json.dumps(
                {
                    "event_id": "evt_1",
                    "event_type": event_type,
                    "form_response": {"form_id": "lT4Z3j", "token": "tok", "answers": []},
                }
            )
            signature = generate_typeform_signature(payload, SECRET)

            response = client.post(
                "/webhooks/typeform",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "Typeform-Signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
