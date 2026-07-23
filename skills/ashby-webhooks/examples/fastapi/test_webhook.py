import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["ASHBY_WEBHOOK_SECRET"] = "test_ashby_secret"

from main import app, verify_ashby_webhook

client = TestClient(app)


def generate_ashby_signature(payload: str, secret: str) -> str:
    """Generate a valid Ashby signature for testing (HMAC-SHA256 hex, 'sha256=' prefix)."""
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={signature}"


class TestVerifyAshbyWebhook:
    """Tests for Ashby signature verification function."""

    secret = os.environ["ASHBY_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"action":"ping","data":{}}'
        signature = generate_ashby_signature(payload.decode(), self.secret)

        assert verify_ashby_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"action":"ping","data":{}}'

        assert verify_ashby_webhook(payload, "sha256=invalid", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"action":"ping","data":{}}'

        assert verify_ashby_webhook(payload, None, self.secret) is False

    def test_malformed_header_returns_false(self):
        payload = b'{"action":"ping","data":{}}'

        assert verify_ashby_webhook(payload, "not_a_valid_format", self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"action":"ping","data":{}}'
        signature = generate_ashby_signature(payload.decode(), self.secret)

        assert verify_ashby_webhook(payload, signature, "wrong_secret") is False

    def test_tampered_payload_returns_false(self):
        original = b'{"action":"candidateHire","data":{"id":1}}'
        signature = generate_ashby_signature(original.decode(), self.secret)
        tampered = b'{"action":"candidateHire","data":{"id":999}}'

        assert verify_ashby_webhook(tampered, signature, self.secret) is False


class TestAshbyWebhook:
    """Tests for the Ashby webhook endpoint."""

    secret = os.environ["ASHBY_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/ashby",
            content='{"action":"ping","data":{}}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"action": "ping", "data": {}})

        response = client.post(
            "/webhooks/ashby",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Ashby-Signature": "sha256=invalid",
            },
        )
        assert response.status_code == 401

    def test_valid_ping_returns_200(self):
        payload = json.dumps({"action": "ping", "data": {}})
        signature = generate_ashby_signature(payload, self.secret)

        response = client.post(
            "/webhooks/ashby",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Ashby-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_application_submit_event(self):
        payload = json.dumps({
            "action": "applicationSubmit",
            "data": {"application": {"id": "app_123"}},
        })
        signature = generate_ashby_signature(payload, self.secret)

        response = client.post(
            "/webhooks/ashby",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Ashby-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_candidate_hire_event(self):
        payload = json.dumps({
            "action": "candidateHire",
            "data": {"candidate": {"id": "cand_123"}},
        })
        signature = generate_ashby_signature(payload, self.secret)

        response = client.post(
            "/webhooks/ashby",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Ashby-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_interview_schedule_create_event(self):
        payload = json.dumps({
            "action": "interviewScheduleCreate",
            "data": {"interviewSchedule": {"id": "sched_123"}},
        })
        signature = generate_ashby_signature(payload, self.secret)

        response = client.post(
            "/webhooks/ashby",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Ashby-Signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
