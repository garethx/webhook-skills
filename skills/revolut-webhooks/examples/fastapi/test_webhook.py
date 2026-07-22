import hashlib
import hmac
import json
import os
import time

# Set test environment variables before importing app
os.environ["REVOLUT_SIGNING_SECRET"] = "wsk_test_secret"

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
SECRET = os.environ["REVOLUT_SIGNING_SECRET"]


def generate_revolut_signature(payload: str, secret: str, timestamp: str | None = None):
    """Generate a valid Revolut signature header for testing.

    Signed payload is ``v1.{timestamp}.{raw body}``, HMAC-SHA256, hex.
    """
    if timestamp is None:
        timestamp = str(int(time.time() * 1000))
    signature = hmac.new(
        secret.encode(),
        f"v1.{timestamp}.{payload}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"v1={signature}", timestamp


class TestRevolutWebhook:
    def test_missing_headers_returns_400(self):
        response = client.post(
            "/webhooks/revolut",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing Revolut signature headers" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"event": "ORDER_COMPLETED", "order_id": "ord_1"})
        signature, timestamp = "v1=invalid", str(int(time.time() * 1000))

        response = client.post(
            "/webhooks/revolut",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Revolut-Signature": signature,
                "Revolut-Request-Timestamp": timestamp,
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original = json.dumps({"event": "ORDER_COMPLETED", "order_id": "ord_1"})
        signature, timestamp = generate_revolut_signature(original, SECRET)
        tampered = json.dumps({"event": "ORDER_COMPLETED", "order_id": "ord_x"})

        response = client.post(
            "/webhooks/revolut",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "Revolut-Signature": signature,
                "Revolut-Request-Timestamp": timestamp,
            },
        )
        assert response.status_code == 400

    def test_stale_timestamp_returns_400(self):
        payload = json.dumps({"event": "ORDER_COMPLETED", "order_id": "ord_1"})
        stale_ts = str(int(time.time() * 1000) - 10 * 60 * 1000)  # 10 minutes ago
        signature, _ = generate_revolut_signature(payload, SECRET, stale_ts)

        response = client.post(
            "/webhooks/revolut",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Revolut-Signature": signature,
                "Revolut-Request-Timestamp": stale_ts,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {
                "event": "ORDER_COMPLETED",
                "order_id": "ord_valid",
                "merchant_order_ext_ref": "Order #1",
            }
        )
        signature, timestamp = generate_revolut_signature(payload, SECRET)

        response = client.post(
            "/webhooks/revolut",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Revolut-Signature": signature,
                "Revolut-Request-Timestamp": timestamp,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_rotation_multiple_signatures_returns_200(self):
        payload = json.dumps({"event": "ORDER_AUTHORISED", "order_id": "ord_rot"})
        signature, timestamp = generate_revolut_signature(payload, SECRET)
        header = f"v1=deadbeef,{signature}"  # first wrong, second correct

        response = client.post(
            "/webhooks/revolut",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Revolut-Signature": header,
                "Revolut-Request-Timestamp": timestamp,
            },
        )
        assert response.status_code == 200

    def test_handles_different_event_types(self):
        event_types = [
            "ORDER_COMPLETED",
            "ORDER_AUTHORISED",
            "ORDER_CANCELLED",
            "ORDER_PAYMENT_AUTHENTICATED",
            "ORDER_PAYMENT_DECLINED",
            "ORDER_PAYMENT_FAILED",
            "UNKNOWN_EVENT",
        ]

        for event_type in event_types:
            payload = json.dumps({"event": event_type, "order_id": "ord_1"})
            signature, timestamp = generate_revolut_signature(payload, SECRET)

            response = client.post(
                "/webhooks/revolut",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "Revolut-Signature": signature,
                    "Revolut-Request-Timestamp": timestamp,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
