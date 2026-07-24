import os
import json
import hmac
import hashlib
import base64

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["SHOPLINE_APP_SECRET"] = "test_shopline_secret"

from main import app, verify_shopline_webhook

client = TestClient(app)


def generate_shopline_signature(payload: str, secret: str, encoding: str = "base64") -> str:
    """Generate a valid SHOPLINE HMAC signature for testing.

    SHOPLINE's documented encoding is base64 (Shopify-style).
    """
    digest = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    if encoding == "hex":
        return digest.hex()
    return base64.b64encode(digest).decode("utf-8")


class TestVerifyShoplineWebhook:
    """Tests for SHOPLINE signature verification function."""

    secret = os.environ["SHOPLINE_APP_SECRET"]

    def test_valid_base64_signature_returns_true(self):
        payload = b'{"id":123}'
        signature = generate_shopline_signature(payload.decode(), self.secret, "base64")

        assert verify_shopline_webhook(payload, signature, self.secret) is True

    def test_valid_hex_signature_returns_true(self):
        payload = b'{"id":123}'
        signature = generate_shopline_signature(payload.decode(), self.secret, "hex")

        assert verify_shopline_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"id":123}'

        assert verify_shopline_webhook(payload, "invalid_signature", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"id":123}'

        assert verify_shopline_webhook(payload, None, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"id":123}'
        signature = generate_shopline_signature(payload.decode(), self.secret)

        assert verify_shopline_webhook(payload, signature, "wrong_secret") is False

    def test_tampered_payload_returns_false(self):
        signature = generate_shopline_signature('{"amount":100}', self.secret)

        assert verify_shopline_webhook(b'{"amount":999}', signature, self.secret) is False


class TestShoplineWebhook:
    """Tests for the SHOPLINE webhook endpoint."""

    secret = os.environ["SHOPLINE_APP_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/shopline",
            content='{"id":123}',
            headers={
                "Content-Type": "application/json",
                "X-Shopline-Topic": "orders/create",
                "X-Shopline-Shop-Domain": "test.myshopline.com",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"id": 123})

        response = client.post(
            "/webhooks/shopline",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Shopline-Hmac-Sha256": "invalid_signature",
                "X-Shopline-Topic": "orders/create",
                "X-Shopline-Shop-Domain": "test.myshopline.com",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps({"id": 123, "email": "test@example.com"})
        signature = generate_shopline_signature(payload, self.secret)

        response = client.post(
            "/webhooks/shopline",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Shopline-Hmac-Sha256": signature,
                "X-Shopline-Topic": "orders/create",
                "X-Shopline-Shop-Domain": "test.myshopline.com",
                "X-Shopline-Webhook-Id": "evt_123",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_hex_signature_returns_200(self):
        payload = json.dumps({"id": 123})
        signature = generate_shopline_signature(payload, self.secret, "hex")

        response = client.post(
            "/webhooks/shopline",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Shopline-Hmac-Sha256": signature,
                "X-Shopline-Topic": "orders/create",
                "X-Shopline-Shop-Domain": "test.myshopline.com",
            },
        )
        assert response.status_code == 200

    def test_handles_different_topics(self):
        topics = [
            "orders/create",
            "orders/update",
            "orders/paid",
            "orders/cancelled",
            "products/create",
            "products/update",
            "products/delete",
            "collect/create",
            "collect/delete",
            "customers/create",
            "app/uninstalled",
        ]

        for topic in topics:
            payload = json.dumps({"id": 456})
            signature = generate_shopline_signature(payload, self.secret)

            response = client.post(
                "/webhooks/shopline",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Shopline-Hmac-Sha256": signature,
                    "X-Shopline-Topic": topic,
                    "X-Shopline-Shop-Domain": "test.myshopline.com",
                },
            )
            assert response.status_code == 200, f"Failed for topic: {topic}"


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
