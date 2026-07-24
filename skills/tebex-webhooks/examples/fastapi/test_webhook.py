import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["TEBEX_WEBHOOK_SECRET"] = "test_webhook_secret"

from main import app

client = TestClient(app)


def generate_tebex_signature(payload: str, secret: str) -> str:
    """Generate a valid Tebex signature for testing.

    Matches the provider's two-step algorithm:
      HMAC-SHA256(secret, SHA256(body))
    """
    body_hash = hashlib.sha256(payload.encode()).hexdigest()
    return hmac.new(
        secret.encode(), body_hash.encode(), hashlib.sha256
    ).hexdigest()


class TestTebexWebhook:
    """Tests for the Tebex webhook endpoint."""

    webhook_secret = os.environ["TEBEX_WEBHOOK_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/tebex",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing X-Signature" in response.text

    def test_invalid_signature_returns_400(self):
        payload = json.dumps(
            {"id": "evt_1", "type": "payment.completed", "subject": {}}
        )
        response = client.post(
            "/webhooks/tebex",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Signature": "deadbeef",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.text

    def test_tampered_payload_returns_400(self):
        original = json.dumps(
            {"id": "evt_1", "type": "payment.completed", "subject": {"id": "a"}}
        )
        signature = generate_tebex_signature(original, self.webhook_secret)
        tampered = json.dumps(
            {"id": "evt_1", "type": "payment.completed", "subject": {"id": "b"}}
        )
        response = client.post(
            "/webhooks/tebex",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "X-Signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {"id": "evt_valid", "type": "payment.completed", "subject": {}}
        )
        signature = generate_tebex_signature(payload, self.webhook_secret)
        response = client.post(
            "/webhooks/tebex",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_validation_webhook_echoes_id(self):
        payload = json.dumps(
            {"id": "wh_validation_123", "type": "validation.webhook", "subject": {}}
        )
        signature = generate_tebex_signature(payload, self.webhook_secret)
        response = client.post(
            "/webhooks/tebex",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"id": "wh_validation_123"}

    def test_handles_different_event_types(self):
        event_types = [
            "payment.completed",
            "payment.declined",
            "payment.refunded",
            "payment.dispute.opened",
            "payment.dispute.won",
            "payment.dispute.lost",
            "payment.dispute.closed",
            "recurring-payment.started",
            "recurring-payment.renewed",
            "recurring-payment.ended",
            "recurring-payment.cancellation.requested",
            "recurring-payment.cancellation.aborted",
            "unknown.event.type",
        ]

        for event_type in event_types:
            payload = json.dumps(
                {"id": f"evt_{event_type}", "type": event_type, "subject": {}}
            )
            signature = generate_tebex_signature(payload, self.webhook_secret)
            response = client.post(
                "/webhooks/tebex",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
