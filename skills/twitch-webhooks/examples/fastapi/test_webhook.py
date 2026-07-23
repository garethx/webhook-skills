import os
import json
import hmac
import hashlib
from datetime import datetime, timedelta, timezone

# Set test environment variables before importing app
os.environ["TWITCH_WEBHOOK_SECRET"] = "test_twitch_secret"

from fastapi.testclient import TestClient

from main import app, verify_twitch_signature

client = TestClient(app)

SECRET = os.environ["TWITCH_WEBHOOK_SECRET"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def generate_twitch_signature(message_id: str, timestamp: str, payload: str, secret: str) -> str:
    """Generate a valid Twitch EventSub signature for testing."""
    message = message_id.encode("utf-8") + timestamp.encode("utf-8") + payload.encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def twitch_headers(message_id, timestamp, signature, message_type, subscription_type=None):
    headers = {
        "Content-Type": "application/json",
        "Twitch-Eventsub-Message-Id": message_id,
        "Twitch-Eventsub-Message-Timestamp": timestamp,
        "Twitch-Eventsub-Message-Signature": signature,
        "Twitch-Eventsub-Message-Type": message_type,
    }
    if subscription_type:
        headers["Twitch-Eventsub-Subscription-Type"] = subscription_type
    return headers


class TestVerifyTwitchSignature:
    """Tests for the signature verification function."""

    def test_valid_signature_returns_true(self):
        message_id = "msg-1"
        timestamp = now_iso()
        body = b'{"challenge":"abc"}'
        signature = generate_twitch_signature(message_id, timestamp, body.decode(), SECRET)

        assert verify_twitch_signature(message_id, timestamp, body, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        message_id = "msg-1"
        timestamp = now_iso()
        body = b'{"challenge":"abc"}'

        assert verify_twitch_signature(message_id, timestamp, body, "sha256=invalid", SECRET) is False

    def test_missing_message_id_returns_false(self):
        timestamp = now_iso()
        body = b'{"challenge":"abc"}'
        signature = generate_twitch_signature("msg-1", timestamp, body.decode(), SECRET)

        assert verify_twitch_signature(None, timestamp, body, signature, SECRET) is False

    def test_wrong_secret_returns_false(self):
        message_id = "msg-1"
        timestamp = now_iso()
        body = b'{"challenge":"abc"}'
        signature = generate_twitch_signature(message_id, timestamp, body.decode(), SECRET)

        assert verify_twitch_signature(message_id, timestamp, body, signature, "wrong_secret") is False

    def test_tampered_body_returns_false(self):
        message_id = "msg-1"
        timestamp = now_iso()
        body = b'{"challenge":"abc"}'
        signature = generate_twitch_signature(message_id, timestamp, body.decode(), SECRET)

        assert verify_twitch_signature(message_id, timestamp, b'{"challenge":"xyz"}', signature, SECRET) is False


class TestTwitchWebhook:
    """Tests for the webhook endpoint."""

    def test_missing_signature_returns_403(self):
        message_id = "msg-1"
        timestamp = now_iso()
        payload = json.dumps({"challenge": "abc"})

        response = client.post(
            "/webhooks/twitch",
            content=payload,
            headers=twitch_headers(message_id, timestamp, "", "webhook_callback_verification"),
        )
        assert response.status_code == 403

    def test_invalid_signature_returns_403(self):
        message_id = "msg-1"
        timestamp = now_iso()
        payload = json.dumps({"challenge": "abc"})

        response = client.post(
            "/webhooks/twitch",
            content=payload,
            headers=twitch_headers(message_id, timestamp, "sha256=invalid", "webhook_callback_verification"),
        )
        assert response.status_code == 403

    def test_verification_echoes_challenge_as_text(self):
        message_id = "msg-verify"
        timestamp = now_iso()
        payload = json.dumps({"challenge": "pogchamp-challenge-123"})
        signature = generate_twitch_signature(message_id, timestamp, payload, SECRET)

        response = client.post(
            "/webhooks/twitch",
            content=payload,
            headers=twitch_headers(message_id, timestamp, signature, "webhook_callback_verification"),
        )
        assert response.status_code == 200
        assert response.text == "pogchamp-challenge-123"
        assert response.headers["content-type"].startswith("text/plain")

    def test_stream_online_notification_returns_204(self):
        message_id = "msg-online"
        timestamp = now_iso()
        payload = json.dumps({
            "subscription": {"type": "stream.online", "version": "1"},
            "event": {"broadcaster_user_name": "Cool_User", "type": "live"},
        })
        signature = generate_twitch_signature(message_id, timestamp, payload, SECRET)

        response = client.post(
            "/webhooks/twitch",
            content=payload,
            headers=twitch_headers(message_id, timestamp, signature, "notification", "stream.online"),
        )
        assert response.status_code == 204

    def test_channel_follow_notification_returns_204(self):
        message_id = "msg-follow"
        timestamp = now_iso()
        payload = json.dumps({
            "subscription": {"type": "channel.follow", "version": "2"},
            "event": {"user_name": "Follower", "broadcaster_user_name": "Cool_User"},
        })
        signature = generate_twitch_signature(message_id, timestamp, payload, SECRET)

        response = client.post(
            "/webhooks/twitch",
            content=payload,
            headers=twitch_headers(message_id, timestamp, signature, "notification", "channel.follow"),
        )
        assert response.status_code == 204

    def test_revocation_returns_204(self):
        message_id = "msg-revoke"
        timestamp = now_iso()
        payload = json.dumps({
            "subscription": {"type": "stream.online", "status": "authorization_revoked"},
        })
        signature = generate_twitch_signature(message_id, timestamp, payload, SECRET)

        response = client.post(
            "/webhooks/twitch",
            content=payload,
            headers=twitch_headers(message_id, timestamp, signature, "revocation", "stream.online"),
        )
        assert response.status_code == 204

    def test_stale_timestamp_returns_403(self):
        message_id = "msg-stale"
        timestamp = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat().replace("+00:00", "Z")
        payload = json.dumps({
            "subscription": {"type": "stream.online", "version": "1"},
            "event": {"broadcaster_user_name": "Cool_User", "type": "live"},
        })
        signature = generate_twitch_signature(message_id, timestamp, payload, SECRET)

        response = client.post(
            "/webhooks/twitch",
            content=payload,
            headers=twitch_headers(message_id, timestamp, signature, "notification", "stream.online"),
        )
        assert response.status_code == 403


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
