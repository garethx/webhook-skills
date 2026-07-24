import os
import json
import hmac
import hashlib
import base64

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["SHIPHERO_WEBHOOK_SECRET"] = "test_shiphero_secret"

from main import app, verify_shiphero_webhook

client = TestClient(app)

SECRET = os.environ["SHIPHERO_WEBHOOK_SECRET"]


def generate_shiphero_signature(payload: str, secret: str) -> str:
    """Generate a valid ShipHero HMAC signature for testing.

    Matches ShipHero's algorithm: base64(HMAC-SHA256(rawBody, secret)).
    """
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")


class TestVerifyShipHeroWebhook:
    """Tests for the ShipHero signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = b'{"webhook_type":"Order Allocated"}'
        signature = generate_shiphero_signature(payload.decode(), SECRET)

        assert verify_shiphero_webhook(payload, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"webhook_type":"Order Allocated"}'

        assert verify_shiphero_webhook(payload, "invalid_signature", SECRET) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"webhook_type":"Order Allocated"}'

        assert verify_shiphero_webhook(payload, None, SECRET) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"webhook_type":"Inventory Update","qty":10}'
        signature = generate_shiphero_signature(original.decode(), SECRET)
        tampered = b'{"webhook_type":"Inventory Update","qty":999}'

        assert verify_shiphero_webhook(tampered, signature, SECRET) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"webhook_type":"Order Allocated"}'
        signature = generate_shiphero_signature(payload.decode(), SECRET)

        assert verify_shiphero_webhook(payload, signature, "wrong_secret") is False


class TestShipHeroWebhook:
    """Tests for the ShipHero webhook endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/shiphero",
            content='{"webhook_type":"Order Allocated"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"webhook_type": "Order Allocated"})

        response = client.post(
            "/webhooks/shiphero",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-shiphero-hmac-sha256": "invalid_signature",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {"account_id": 63898, "webhook_type": "Order Allocated", "order_number": "SO-1001"}
        )
        signature = generate_shiphero_signature(payload, SECRET)

        response = client.post(
            "/webhooks/shiphero",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-shiphero-hmac-sha256": signature,
                "X-Shiphero-Message-ID": "msg-123",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"code": "200", "Status": "Success"}

    def test_handles_different_webhook_types(self):
        types = [
            "Order Allocated",
            "Shipment Update",
            "Inventory Update",
            "Order Canceled",
            "PO Update",
            "Return Update",
            "Tote Complete",
            "Package Added",
        ]

        for webhook_type in types:
            payload = json.dumps({"account_id": 63898, "webhook_type": webhook_type})
            signature = generate_shiphero_signature(payload, SECRET)

            response = client.post(
                "/webhooks/shiphero",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-shiphero-hmac-sha256": signature,
                },
            )
            assert response.status_code == 200, f"Failed for webhook type: {webhook_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
