import os
import json
import hmac
import hashlib
import base64

from fastapi.testclient import TestClient

# Zendesk's static secret for test webhooks (before the webhook is created).
TEST_SECRET = "dGhpc19zZWNyZXRfaXNfZm9yX3Rlc3Rpbmdfb25seQ=="
os.environ["ZENDESK_WEBHOOK_SECRET"] = TEST_SECRET

from main import app, verify_zendesk_webhook

client = TestClient(app)

TIMESTAMP = "2026-07-22T10:00:00Z"


def generate_zendesk_signature(payload: str, timestamp: str, secret: str) -> str:
    """Generate a valid Zendesk signature for testing.

    base64(HMAC_SHA256(secret, timestamp + body)) — timestamp prepended, no separator.
    """
    message = timestamp.encode("utf-8") + payload.encode("utf-8")
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    ).decode("utf-8")


class TestVerifyZendeskWebhook:
    """Tests for the Zendesk signature verification function."""

    secret = TEST_SECRET

    def test_valid_signature_returns_true(self):
        payload = b'{"type":"zen:event-type:ticket.created"}'
        signature = generate_zendesk_signature(payload.decode(), TIMESTAMP, self.secret)

        assert verify_zendesk_webhook(payload, signature, TIMESTAMP, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"type":"zen:event-type:ticket.created"}'

        assert verify_zendesk_webhook(payload, "invalid_signature", TIMESTAMP, self.secret) is False

    def test_tampered_payload_returns_false(self):
        payload = b'{"amount":100}'
        signature = generate_zendesk_signature(payload.decode(), TIMESTAMP, self.secret)
        tampered = b'{"amount":999}'

        assert verify_zendesk_webhook(tampered, signature, TIMESTAMP, self.secret) is False

    def test_changed_timestamp_returns_false(self):
        payload = b'{"type":"zen:event-type:ticket.created"}'
        signature = generate_zendesk_signature(payload.decode(), TIMESTAMP, self.secret)

        assert verify_zendesk_webhook(payload, signature, "2020-01-01T00:00:00Z", self.secret) is False

    def test_empty_body_returns_true(self):
        """Some requests (GET/DELETE) have no body; signing an empty body is valid."""
        payload = b""
        signature = generate_zendesk_signature("", TIMESTAMP, self.secret)

        assert verify_zendesk_webhook(payload, signature, TIMESTAMP, self.secret) is True


class TestZendeskWebhook:
    """Tests for the Zendesk webhook endpoint."""

    secret = TEST_SECRET

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/zendesk",
            content='{"type":"zen:event-type:ticket.created"}',
            headers={
                "Content-Type": "application/json",
                "X-Zendesk-Webhook-Signature-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 400
        assert "Missing signature headers" in response.json()["detail"]

    def test_missing_timestamp_returns_400(self):
        payload = '{"type":"zen:event-type:ticket.created"}'
        signature = generate_zendesk_signature(payload, TIMESTAMP, self.secret)

        response = client.post(
            "/webhooks/zendesk",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Zendesk-Webhook-Signature": signature,
            },
        )
        assert response.status_code == 400
        assert "Missing signature headers" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"type": "zen:event-type:ticket.created"})

        response = client.post(
            "/webhooks/zendesk",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Zendesk-Webhook-Signature": "invalid_signature",
                "X-Zendesk-Webhook-Signature-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_valid_signature_returns_200(self):
        payload = json.dumps({"type": "zen:event-type:ticket.created", "detail": {"id": "35436"}})
        signature = generate_zendesk_signature(payload, TIMESTAMP, self.secret)

        response = client.post(
            "/webhooks/zendesk",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Zendesk-Webhook-Signature": signature,
                "X-Zendesk-Webhook-Signature-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_supported_event_types(self):
        event_types = [
            "zen:event-type:ticket.created",
            "zen:event-type:ticket.status_changed",
            "zen:event-type:ticket.comment_added",
            "zen:event-type:ticket.priority_changed",
            "zen:event-type:ticket.agent_assignment_changed",
            "zen:event-type:user.created",
            "zen:event-type:organization.created",
        ]

        for event_type in event_types:
            payload = json.dumps({"type": event_type, "detail": {"id": "123"}})
            signature = generate_zendesk_signature(payload, TIMESTAMP, self.secret)

            response = client.post(
                "/webhooks/zendesk",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Zendesk-Webhook-Signature": signature,
                    "X-Zendesk-Webhook-Signature-Timestamp": TIMESTAMP,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"

    def test_accepts_custom_trigger_payload(self):
        """Webhooks connected to a trigger/automation send custom JSON with no type field."""
        payload = json.dumps({"ticket_id": "35436", "custom": True})
        signature = generate_zendesk_signature(payload, TIMESTAMP, self.secret)

        response = client.post(
            "/webhooks/zendesk",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Zendesk-Webhook-Signature": signature,
                "X-Zendesk-Webhook-Signature-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
