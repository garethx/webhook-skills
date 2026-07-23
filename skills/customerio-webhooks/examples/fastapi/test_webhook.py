import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["CUSTOMERIO_WEBHOOK_SIGNING_KEY"] = "test_signing_key"

from main import app, verify_customerio_webhook

client = TestClient(app)

TIMESTAMP = "1613063089"


def generate_customerio_signature(payload: str, timestamp: str, key: str) -> str:
    """Generate a valid Customer.io signature for testing.

    Signed string: "v0:<timestamp>:<raw body>", HMAC-SHA256, hex.
    """
    signed_content = f"v0:{timestamp}:{payload}".encode("utf-8")
    return hmac.new(key.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()


class TestVerifyCustomerIoWebhook:
    """Tests for the Customer.io signature verification function."""

    key = os.environ["CUSTOMERIO_WEBHOOK_SIGNING_KEY"]

    def test_valid_signature_returns_true(self):
        payload = b'{"object_type":"email","metric":"opened"}'
        signature = generate_customerio_signature(payload.decode(), TIMESTAMP, self.key)

        assert verify_customerio_webhook(payload, TIMESTAMP, signature, self.key) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"object_type":"email","metric":"opened"}'

        assert verify_customerio_webhook(payload, TIMESTAMP, "deadbeef", self.key) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"object_type":"email","metric":"opened"}'

        assert verify_customerio_webhook(payload, TIMESTAMP, None, self.key) is False

    def test_missing_timestamp_returns_false(self):
        payload = b'{"object_type":"email","metric":"opened"}'
        signature = generate_customerio_signature(payload.decode(), TIMESTAMP, self.key)

        assert verify_customerio_webhook(payload, None, signature, self.key) is False

    def test_tampered_timestamp_returns_false(self):
        payload = b'{"object_type":"email","metric":"opened"}'
        signature = generate_customerio_signature(payload.decode(), TIMESTAMP, self.key)

        assert verify_customerio_webhook(payload, "9999999999", signature, self.key) is False

    def test_wrong_key_returns_false(self):
        payload = b'{"object_type":"email","metric":"opened"}'
        signature = generate_customerio_signature(payload.decode(), TIMESTAMP, self.key)

        assert verify_customerio_webhook(payload, TIMESTAMP, signature, "wrong_key") is False


class TestCustomerIoWebhook:
    """Tests for the Customer.io webhook endpoint."""

    key = os.environ["CUSTOMERIO_WEBHOOK_SIGNING_KEY"]

    def _post(self, payload: str, signature=None, timestamp=TIMESTAMP):
        headers = {"Content-Type": "application/json"}
        if timestamp is not None:
            headers["X-CIO-Timestamp"] = timestamp
        if signature is not None:
            headers["X-CIO-Signature"] = signature
        return client.post("/webhooks/customerio", content=payload, headers=headers)

    def test_missing_signature_returns_401(self):
        payload = json.dumps({"object_type": "email", "metric": "delivered"})
        response = self._post(payload)

        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"object_type": "email", "metric": "delivered"})
        response = self._post(payload, signature="deadbeef")

        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        payload = json.dumps({
            "event_id": "01E4C4CT6YDC7Y5M7FE1GWWPQJ",
            "object_type": "email",
            "metric": "delivered",
            "timestamp": 1613063089,
            "data": {"recipient": "test@example.com"},
        })
        signature = generate_customerio_signature(payload, TIMESTAMP, self.key)
        response = self._post(payload, signature=signature)

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_email_opened_event(self):
        payload = json.dumps({
            "event_id": "evt_1",
            "object_type": "email",
            "metric": "opened",
            "data": {"recipient": "test@example.com"},
        })
        signature = generate_customerio_signature(payload, TIMESTAMP, self.key)
        response = self._post(payload, signature=signature)

        assert response.status_code == 200

    def test_handles_email_clicked_event(self):
        payload = json.dumps({
            "event_id": "evt_2",
            "object_type": "email",
            "metric": "clicked",
            "data": {"recipient": "test@example.com", "href": "https://example.com", "link_id": "lnk_1"},
        })
        signature = generate_customerio_signature(payload, TIMESTAMP, self.key)
        response = self._post(payload, signature=signature)

        assert response.status_code == 200

    def test_handles_customer_unsubscribed_event(self):
        payload = json.dumps({
            "event_id": "evt_3",
            "object_type": "customer",
            "metric": "unsubscribed",
            "data": {"customer_id": "42"},
        })
        signature = generate_customerio_signature(payload, TIMESTAMP, self.key)
        response = self._post(payload, signature=signature)

        assert response.status_code == 200

    def test_tampered_payload_returns_401(self):
        original = json.dumps({"object_type": "email", "metric": "delivered"})
        signature = generate_customerio_signature(original, TIMESTAMP, self.key)
        tampered = json.dumps({"object_type": "email", "metric": "bounced"})
        response = self._post(tampered, signature=signature)

        assert response.status_code == 401


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
