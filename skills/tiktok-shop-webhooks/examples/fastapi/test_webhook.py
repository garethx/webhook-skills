import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["TIKTOK_SHOP_APP_KEY"] = "test_app_key"
os.environ["TIKTOK_SHOP_APP_SECRET"] = "test_app_secret"

from main import app  # noqa: E402

client = TestClient(app)

APP_KEY = os.environ["TIKTOK_SHOP_APP_KEY"]
APP_SECRET = os.environ["TIKTOK_SHOP_APP_SECRET"]


def sign(raw_body: str, app_key: str = APP_KEY, app_secret: str = APP_SECRET) -> str:
    """Generate a valid TikTok Shop signature for testing.

    signature = HMAC-SHA256(key=app_secret, message=app_key + raw_body), hex.
    """
    message = (app_key + raw_body).encode("utf-8")
    return hmac.new(app_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


class TestTikTokShopWebhook:
    def test_missing_authorization_returns_401(self):
        response = client.post(
            "/webhooks/tiktok-shop",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        payload = json.dumps(
            {"type": 1, "tts_notification_id": "n_1", "data": {"order_id": "o_1"}}
        )
        response = client.post(
            "/webhooks/tiktok-shop",
            content=payload,
            headers={"Content-Type": "application/json", "Authorization": "deadbeef"},
        )
        assert response.status_code == 401

    def test_tampered_payload_returns_401(self):
        original = json.dumps({"type": 1, "data": {"order_id": "o_1"}})
        signature = sign(original)
        tampered = json.dumps({"type": 1, "data": {"order_id": "o_hacked"}})
        response = client.post(
            "/webhooks/tiktok-shop",
            content=tampered,
            headers={"Content-Type": "application/json", "Authorization": signature},
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200_empty_body(self):
        payload = json.dumps(
            {
                "type": 1,
                "tts_notification_id": "n_valid",
                "shop_id": "s_1",
                "timestamp": 1633174587,
                "data": {"order_id": "o_valid", "order_status": "AWAITING_SHIPMENT"},
            }
        )
        signature = sign(payload)
        response = client.post(
            "/webhooks/tiktok-shop",
            content=payload,
            headers={"Content-Type": "application/json", "Authorization": signature},
        )
        assert response.status_code == 200
        assert response.text == ""

    def test_handles_core_event_types(self):
        for event_type in [1, 2, 3, 4, 5, 99]:  # 99 = unknown, still acknowledged
            payload = json.dumps(
                {
                    "type": event_type,
                    "tts_notification_id": f"n_{event_type}",
                    "shop_id": "s_1",
                    "data": {
                        "order_id": "o_1",
                        "product_id": "p_1",
                        "package_id": "pkg_1",
                    },
                }
            )
            signature = sign(payload)
            response = client.post(
                "/webhooks/tiktok-shop",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": signature,
                },
            )
            assert response.status_code == 200, f"Failed for type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
