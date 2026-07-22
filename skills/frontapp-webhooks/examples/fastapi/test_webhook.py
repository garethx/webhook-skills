import base64
import hashlib
import hmac
import json
import os
import time

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["FRONT_WEBHOOK_SECRET"] = "test_app_signing_key"

from main import app

client = TestClient(app)

WEBHOOK_SECRET = os.environ["FRONT_WEBHOOK_SECRET"]


def generate_front_signature(payload: str, secret: str, timestamp: str) -> str:
    """Generate a valid Front signature for testing.

    base64(HMAC-SHA256(key = secret, msg = timestamp + ":" + rawBody))
    """
    mac = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    mac.update((timestamp + ":").encode("utf-8"))
    mac.update(payload.encode("utf-8"))
    return base64.b64encode(mac.digest()).decode("utf-8")


class TestFrontWebhook:
    """Tests for Front webhook endpoint."""

    def test_challenge_is_echoed(self):
        """Should echo the X-Front-Challenge header on subscription validation."""
        response = client.post(
            "/webhooks/frontapp",
            content="",
            headers={"X-Front-Challenge": "abc123challenge"},
        )
        assert response.status_code == 200
        assert response.json() == {"challenge": "abc123challenge"}

    def test_missing_signature_returns_400(self):
        """Should return 400 when the signature header is missing."""
        response = client.post(
            "/webhooks/frontapp",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_invalid_signature_returns_400(self):
        """Should return 400 when the signature is invalid."""
        payload = json.dumps({"type": "inbound", "payload": {"id": "evt_test"}})
        response = client.post(
            "/webhooks/frontapp",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Front-Request-Timestamp": "1615496636",
                "X-Front-Signature": "invalid_signature",
            },
        )
        assert response.status_code == 400

    def test_tampered_payload_returns_400(self):
        """Should return 400 when the payload was tampered with after signing."""
        timestamp = str(int(time.time()))
        original = json.dumps({"type": "inbound", "payload": {"id": "evt_original"}})
        signature = generate_front_signature(original, WEBHOOK_SECRET, timestamp)
        tampered = json.dumps({"type": "inbound", "payload": {"id": "evt_tampered"}})

        response = client.post(
            "/webhooks/frontapp",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "X-Front-Request-Timestamp": timestamp,
                "X-Front-Signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        """Should return 200 when the signature is valid."""
        timestamp = str(int(time.time()))
        payload = json.dumps(
            {
                "type": "inbound",
                "payload": {"id": "evt_valid", "conversation": {"id": "cnv_valid"}},
            }
        )
        signature = generate_front_signature(payload, WEBHOOK_SECRET, timestamp)

        response = client.post(
            "/webhooks/frontapp",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Front-Request-Timestamp": timestamp,
                "X-Front-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_event_types(self):
        """Should handle various Front event types."""
        event_types = [
            "inbound",
            "outbound",
            "move",
            "assign",
            "archive",
            "tag",
            "comment",
            "message_bounce_error",
            "unknown_event",
        ]

        for event_type in event_types:
            timestamp = str(int(time.time()))
            payload = json.dumps(
                {
                    "type": event_type,
                    "payload": {"id": f"evt_{event_type}", "conversation": {"id": "cnv_123"}},
                }
            )
            signature = generate_front_signature(payload, WEBHOOK_SECRET, timestamp)

            response = client.post(
                "/webhooks/frontapp",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Front-Request-Timestamp": timestamp,
                    "X-Front-Signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    """Tests for health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
