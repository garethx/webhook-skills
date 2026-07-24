import os
import json
import hmac
import hashlib
import base64
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["FASTSPRING_WEBHOOK_SECRET"] = "test_fastspring_secret"

from main import app, verify_fastspring_webhook

client = TestClient(app)


def generate_fastspring_signature(payload: str, secret: str) -> str:
    """Generate a valid FastSpring X-FS-Signature for testing.

    base64( HMAC-SHA256( raw_body, secret ) )
    """
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")


def batch(events: list) -> str:
    return json.dumps({"events": events})


class TestVerifyFastSpringWebhook:
    """Tests for the FastSpring signature verification function."""

    secret = os.environ["FASTSPRING_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = batch([{"id": "a", "type": "order.completed"}])
        signature = generate_fastspring_signature(payload, self.secret)

        assert verify_fastspring_webhook(payload.encode(), signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = batch([{"id": "a", "type": "order.completed"}])

        assert verify_fastspring_webhook(payload.encode(), "invalid_signature", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = batch([{"id": "a", "type": "order.completed"}])

        assert verify_fastspring_webhook(payload.encode(), "", self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = batch([{"id": "a", "type": "order.completed"}])
        signature = generate_fastspring_signature(original, self.secret)
        tampered = batch([{"id": "a", "type": "order.failed"}])

        assert verify_fastspring_webhook(tampered.encode(), signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = batch([{"id": "a", "type": "order.completed"}])
        signature = generate_fastspring_signature(payload, self.secret)

        assert verify_fastspring_webhook(payload.encode(), signature, "wrong_secret") is False


class TestFastSpringWebhook:
    """Tests for the FastSpring webhook endpoint."""

    secret = os.environ["FASTSPRING_WEBHOOK_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/fastspring",
            content=batch([{"id": "a", "type": "order.completed"}]),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = batch([{"id": "a", "type": "order.completed"}])

        response = client.post(
            "/webhooks/fastspring",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-FS-Signature": "invalid_signature",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = batch([
            {"id": "evt_1", "type": "order.completed", "live": True, "data": {"order": "ORD-1"}}
        ])
        signature = generate_fastspring_signature(payload, self.secret)

        response = client.post(
            "/webhooks/fastspring",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-FS-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_processes_batch_of_multiple_events(self):
        payload = batch([
            {"id": "evt_1", "type": "order.completed"},
            {"id": "evt_2", "type": "subscription.activated"},
            {"id": "evt_3", "type": "subscription.charge.completed"},
        ])
        signature = generate_fastspring_signature(payload, self.secret)

        response = client.post(
            "/webhooks/fastspring",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-FS-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_different_event_types(self):
        types = [
            "order.completed",
            "order.failed",
            "order.canceled",
            "subscription.activated",
            "subscription.charge.completed",
            "subscription.charge.failed",
            "subscription.updated",
            "subscription.canceled",
            "subscription.deactivated",
            "return.created",
        ]

        for event_type in types:
            payload = batch([{"id": f"evt_{event_type}", "type": event_type}])
            signature = generate_fastspring_signature(payload, self.secret)

            response = client.post(
                "/webhooks/fastspring",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-FS-Signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
