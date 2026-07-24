import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["PYLON_WEBHOOK_SECRET"] = "test_pylon_secret"

from main import app, verify_pylon_webhook

client = TestClient(app)

TIMESTAMP = "1624235417"
SECRET = os.environ["PYLON_WEBHOOK_SECRET"]


def generate_pylon_signature(payload: str, timestamp: str, secret: str) -> str:
    """Generate a valid Pylon signature for testing.

    Signs `timestamp + "." + payload` with HMAC-SHA256, hex, "hs256=" prefix.
    """
    signed = timestamp.encode("utf-8") + b"." + payload.encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return f"hs256={digest}"


class TestVerifyPylonWebhook:
    """Tests for the Pylon signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = b'{"event_type":"issue.created"}'
        signature = generate_pylon_signature(payload.decode(), TIMESTAMP, SECRET)
        assert verify_pylon_webhook(payload, TIMESTAMP, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"event_type":"issue.created"}'
        assert verify_pylon_webhook(payload, TIMESTAMP, "hs256=deadbeef", SECRET) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"event_type":"issue.created"}'
        assert verify_pylon_webhook(payload, TIMESTAMP, None, SECRET) is False

    def test_missing_timestamp_returns_false(self):
        payload = b'{"event_type":"issue.created"}'
        signature = generate_pylon_signature(payload.decode(), TIMESTAMP, SECRET)
        assert verify_pylon_webhook(payload, None, signature, SECRET) is False

    def test_tampered_timestamp_returns_false(self):
        payload = b'{"event_type":"issue.created"}'
        signature = generate_pylon_signature(payload.decode(), TIMESTAMP, SECRET)
        assert verify_pylon_webhook(payload, "9999999999", signature, SECRET) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"event_type":"issue.created"}'
        signature = generate_pylon_signature(payload.decode(), TIMESTAMP, SECRET)
        assert verify_pylon_webhook(payload, TIMESTAMP, signature, "wrong_secret") is False


class TestPylonWebhookEndpoint:
    """Tests for the Pylon webhook endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/pylon",
            content='{"event_type":"issue.created"}',
            headers={
                "Content-Type": "application/json",
                "Pylon-Webhook-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"event_type": "issue.created"})
        response = client.post(
            "/webhooks/pylon",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Pylon-Webhook-Signature": "hs256=deadbeef",
                "Pylon-Webhook-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 400

    def test_tampered_payload_returns_400(self):
        original = json.dumps({"event_type": "issue.created", "data": {"id": "1"}})
        signature = generate_pylon_signature(original, TIMESTAMP, SECRET)
        tampered = json.dumps({"event_type": "issue.created", "data": {"id": "999"}})
        response = client.post(
            "/webhooks/pylon",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "Pylon-Webhook-Signature": signature,
                "Pylon-Webhook-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 400

    def test_valid_issue_created_returns_200(self):
        payload = json.dumps(
            {"event_type": "issue.created", "data": {"id": "issue_1", "title": "Login is broken"}}
        )
        signature = generate_pylon_signature(payload, TIMESTAMP, SECRET)
        response = client.post(
            "/webhooks/pylon",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Pylon-Webhook-Signature": signature,
                "Pylon-Webhook-Timestamp": TIMESTAMP,
                "Pylon-Webhook-Version": "2021-07",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_issue_updated_returns_200(self):
        payload = json.dumps(
            {"event_type": "issue.updated", "data": {"id": "issue_1", "state": "closed"}}
        )
        signature = generate_pylon_signature(payload, TIMESTAMP, SECRET)
        response = client.post(
            "/webhooks/pylon",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Pylon-Webhook-Signature": signature,
                "Pylon-Webhook-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
