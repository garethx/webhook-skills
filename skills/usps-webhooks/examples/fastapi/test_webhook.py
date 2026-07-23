import os
import json
import hmac
import hashlib
import base64

# Set test environment variables before importing app
os.environ["USPS_WEBHOOK_SECRET"] = "test_usps_secret_32_chars_000000"

from fastapi.testclient import TestClient
from main import app, verify_usps_signature

client = TestClient(app)
SECRET = os.environ["USPS_WEBHOOK_SECRET"]


def sign(timestamp: str, payload: str, secret: str) -> str:
    return base64.b64encode(
        hmac.new(secret.encode(), (timestamp + payload).encode(), hashlib.sha256).digest()
    ).decode()


def build_notification(tracking_obj: dict, secret: str, subscription_type: str = "TRACKING"):
    """Build a USPS notification envelope and its X-HMAC signature."""
    timestamp = "2026-07-23T14:32:00Z"
    payload = json.dumps(tracking_obj)
    envelope = {
        "subscriptionId": "a1b2c3d4-0000-0000-0000-000000000000",
        "subscriptionType": subscription_type,
        "timestamp": timestamp,
        "payload": payload,
        "links": [],
    }
    return json.dumps(envelope), sign(timestamp, payload, secret)


class TestVerifyUspsSignature:
    """Tests for USPS signature verification function."""

    def test_valid_signature_returns_true(self):
        timestamp = "2026-07-23T14:32:00Z"
        payload = '{"trackingNumber":"940010","status":"Delivered"}'
        signature = sign(timestamp, payload, SECRET)
        assert verify_usps_signature(timestamp, payload, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        assert verify_usps_signature("t", "p", "invalid_signature", SECRET) is False

    def test_missing_signature_returns_false(self):
        assert verify_usps_signature("t", "p", None, SECRET) is False

    def test_tampered_payload_returns_false(self):
        timestamp = "2026-07-23T14:32:00Z"
        payload = '{"status":"Delivered"}'
        signature = sign(timestamp, payload, SECRET)
        assert verify_usps_signature(timestamp, '{"status":"Alert"}', signature, SECRET) is False


class TestUspsWebhook:
    """Tests for the USPS webhook endpoint."""

    def test_missing_signature_returns_400(self):
        body, _ = build_notification({"trackingNumber": "940010", "status": "Delivered"}, SECRET)
        response = client.post(
            "/webhooks/usps",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        body, _ = build_notification({"trackingNumber": "940010", "status": "Delivered"}, SECRET)
        response = client.post(
            "/webhooks/usps",
            content=body,
            headers={"Content-Type": "application/json", "X-HMAC": "invalid_signature"},
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        body, signature = build_notification(
            {"trackingNumber": "9400100000000000000000", "status": "Delivered"}, SECRET
        )
        response = client.post(
            "/webhooks/usps",
            content=body,
            headers={"Content-Type": "application/json", "X-HMAC": signature},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_deprecated_hmac_header_alias(self):
        body, signature = build_notification(
            {"trackingNumber": "9400100000000000000000", "status": "In Transit"}, SECRET
        )
        response = client.post(
            "/webhooks/usps",
            content=body,
            headers={"Content-Type": "application/json", "hmac-header": signature},
        )
        assert response.status_code == 200

    def test_handles_all_tracking_statuses(self):
        statuses = [
            "Pre-Shipment",
            "Accepted",
            "In Transit",
            "Out for Delivery",
            "Delivered",
            "Available for Pickup",
            "Delivery Attempt",
            "Alert",
        ]
        for status in statuses:
            body, signature = build_notification(
                {"trackingNumber": "9400100000000000000000", "status": status}, SECRET
            )
            response = client.post(
                "/webhooks/usps",
                content=body,
                headers={"Content-Type": "application/json", "X-HMAC": signature},
            )
            assert response.status_code == 200, f"Failed for status: {status}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
