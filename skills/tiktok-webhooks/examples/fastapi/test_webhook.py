import os
import hmac
import hashlib
import json
import time

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["TIKTOK_CLIENT_SECRET"] = "test_tiktok_client_secret"

from main import app, verify_tiktok_webhook

client = TestClient(app)

SECRET = os.environ["TIKTOK_CLIENT_SECRET"]

SAMPLE_PAYLOAD = json.dumps(
    {
        "client_key": "awx4example",
        "event": "video.publish.completed",
        "create_time": 1633174587,
        "user_openid": "0f9c1e2b-1234-5678-9abc-def012345678",
        "content": json.dumps({"share_id": "video.7107000000000000000"}),
    }
)


def sign_header(raw_body: str, secret: str = SECRET, timestamp: int | None = None) -> str:
    """Build a valid TikTok-Signature header.

    signature = HMAC-SHA256(client_secret, "<t>.<raw_body>"), hex.
    """
    if timestamp is None:
        timestamp = int(time.time())
    signed = f"{timestamp}.{raw_body}".encode("utf-8")
    s = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return f"t={timestamp},s={s}"


class TestVerifyTikTokWebhook:
    def test_valid_signature_returns_true(self):
        body = SAMPLE_PAYLOAD.encode("utf-8")
        assert verify_tiktok_webhook(body, sign_header(SAMPLE_PAYLOAD), SECRET) is True

    def test_tampered_body_returns_false(self):
        header = sign_header(SAMPLE_PAYLOAD)
        tampered = SAMPLE_PAYLOAD.replace("completed", "failed").encode("utf-8")
        assert verify_tiktok_webhook(tampered, header, SECRET) is False

    def test_wrong_secret_returns_false(self):
        body = SAMPLE_PAYLOAD.encode("utf-8")
        assert verify_tiktok_webhook(body, sign_header(SAMPLE_PAYLOAD), "wrong_secret") is False

    def test_missing_header_returns_false(self):
        body = SAMPLE_PAYLOAD.encode("utf-8")
        assert verify_tiktok_webhook(body, None, SECRET) is False

    def test_missing_secret_returns_false(self):
        body = SAMPLE_PAYLOAD.encode("utf-8")
        assert verify_tiktok_webhook(body, sign_header(SAMPLE_PAYLOAD), None) is False

    def test_stale_timestamp_returns_false(self):
        body = SAMPLE_PAYLOAD.encode("utf-8")
        old = int(time.time()) - 10000
        header = sign_header(SAMPLE_PAYLOAD, SECRET, old)
        assert verify_tiktok_webhook(body, header, SECRET) is False


class TestTikTokWebhookEndpoint:
    def _post(self, body: str, header: str | None):
        headers = {"Content-Type": "application/json"}
        if header is not None:
            headers["TikTok-Signature"] = header
        return client.post("/webhooks/tiktok", content=body, headers=headers)

    def test_valid_signature_returns_200(self):
        response = self._post(SAMPLE_PAYLOAD, sign_header(SAMPLE_PAYLOAD))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_missing_signature_returns_401(self):
        response = self._post(SAMPLE_PAYLOAD, None)
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        response = self._post(SAMPLE_PAYLOAD, "t=1633174587,s=deadbeef")
        assert response.status_code == 401

    def test_tampered_payload_returns_401(self):
        header = sign_header(SAMPLE_PAYLOAD)
        response = self._post(SAMPLE_PAYLOAD.replace("publish", "upload"), header)
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "event,content",
        [
            ("authorization.removed", {"reason": 1}),
            ("video.upload.failed", {"share_id": "video.700"}),
            ("video.publish.completed", {"share_id": "video.701"}),
            ("portability.download.ready", {"request_id": 123456789}),
        ],
    )
    def test_handles_each_event(self, event, content):
        body = json.dumps(
            {
                "client_key": "awx4example",
                "event": event,
                "create_time": 1633174587,
                "user_openid": "0f9c1e2b",
                "content": json.dumps(content),
            }
        )
        response = self._post(body, sign_header(body))
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
