import hashlib
import hmac
import json
import os
import time

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["ASCEND_WEBHOOK_SECRET"] = "test_ascend_secret"

from main import app  # noqa: E402

client = TestClient(app)


def generate_ascend_signature(payload: str, secret: str, timestamp: int | None = None) -> str:
    """Generate a valid Ascend signature header for testing.

    Signed string is ``<timestamp>:<payload>`` (colon separator, RAW body).
    """
    if timestamp is None:
        timestamp = int(time.time())
    signed = f"{timestamp}:{payload}"
    signature = hmac.new(
        secret.encode("utf-8"), signed.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


class TestAscendWebhook:
    """Tests for the Ascend webhook endpoint."""

    webhook_secret = os.environ["ASCEND_WEBHOOK_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/ascend",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps(
            {"id": "evt_test", "type": "invoice.paid", "data": {"id": "inv_test"}}
        )
        response = client.post(
            "/webhooks/ascend",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Ascend-Signature": "t=123,v1=deadbeef",
            },
        )
        assert response.status_code == 400

    def test_tampered_payload_returns_400(self):
        original = json.dumps(
            {"id": "evt_test", "type": "invoice.paid", "data": {"id": "inv_test"}}
        )
        signature = generate_ascend_signature(original, self.webhook_secret)
        tampered = json.dumps(
            {"id": "evt_test", "type": "invoice.paid", "data": {"id": "inv_tampered"}}
        )
        response = client.post(
            "/webhooks/ascend",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "X-Ascend-Signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {
                "id": "evt_test_valid",
                "type": "invoice.paid",
                "data": {"id": "inv_test_valid", "invoice_number": "II2DH1HGHJ"},
            }
        )
        signature = generate_ascend_signature(payload, self.webhook_secret)
        response = client.post(
            "/webhooks/ascend",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Ascend-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_event_types(self):
        event_types = [
            "invoice.paid",
            "invoice.voided",
            "payout.paid",
            "refund.paid",
            "unknown.event.type",
        ]
        for event_type in event_types:
            payload = json.dumps(
                {
                    "id": f"evt_{event_type.replace('.', '_')}",
                    "type": event_type,
                    "data": {"id": "obj_123"},
                }
            )
            signature = generate_ascend_signature(payload, self.webhook_secret)
            response = client.post(
                "/webhooks/ascend",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Ascend-Signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
