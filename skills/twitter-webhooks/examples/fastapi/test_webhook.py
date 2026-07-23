import base64
import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["TWITTER_CONSUMER_SECRET"] = "test_consumer_secret"

from main import app, build_signature, verify_twitter_signature  # noqa: E402

client = TestClient(app)

CONSUMER_SECRET = os.environ["TWITTER_CONSUMER_SECRET"]


def generate_signature(message: bytes, secret: str) -> str:
    """Generate a valid X signature for testing."""
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return "sha256=" + base64.b64encode(digest).decode("utf-8")


class TestVerifyTwitterSignature:
    def test_valid_signature_returns_true(self):
        body = b'{"for_user_id":"123","follow_events":[]}'
        sig = generate_signature(body, CONSUMER_SECRET)
        assert verify_twitter_signature(body, sig, CONSUMER_SECRET) is True

    def test_invalid_signature_returns_false(self):
        body = b'{"for_user_id":"123"}'
        assert verify_twitter_signature(body, "sha256=deadbeef", CONSUMER_SECRET) is False

    def test_missing_signature_returns_false(self):
        assert verify_twitter_signature(b"{}", None, CONSUMER_SECRET) is False

    def test_tampered_body_returns_false(self):
        original = b'{"follow_events":[{"type":"follow"}]}'
        tampered = b'{"follow_events":[{"type":"unfollow"}]}'
        sig = generate_signature(original, CONSUMER_SECRET)
        assert verify_twitter_signature(tampered, sig, CONSUMER_SECRET) is False

    def test_wrong_secret_returns_false(self):
        body = b"{}"
        sig = generate_signature(body, CONSUMER_SECRET)
        assert verify_twitter_signature(body, sig, "wrong_secret") is False


class TestBuildSignature:
    def test_produces_sha256_prefixed_base64(self):
        sig = build_signature(b"crc_token_value", CONSUMER_SECRET)
        assert sig.startswith("sha256=")

    def test_matches_documented_crc_computation(self):
        crc_token = "abc123"
        digest = hmac.new(
            CONSUMER_SECRET.encode("utf-8"), crc_token.encode("utf-8"), hashlib.sha256
        ).digest()
        expected = "sha256=" + base64.b64encode(digest).decode("utf-8")
        assert build_signature(crc_token.encode("utf-8"), CONSUMER_SECRET) == expected


class TestCRC:
    def test_returns_response_token_for_valid_crc_token(self):
        crc_token = "crc_challenge_token"
        response = client.get("/webhooks/twitter", params={"crc_token": crc_token})
        assert response.status_code == 200
        expected = generate_signature(crc_token.encode("utf-8"), CONSUMER_SECRET)
        assert response.json()["response_token"] == expected

    def test_returns_400_when_crc_token_missing(self):
        response = client.get("/webhooks/twitter")
        assert response.status_code == 400


class TestTwitterWebhookEndpoint:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/twitter",
            content='{"for_user_id":"123"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert response.text == "Invalid signature"

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/twitter",
            content='{"for_user_id":"123"}',
            headers={
                "Content-Type": "application/json",
                "x-twitter-webhooks-signature": "sha256=invalid",
            },
        )
        assert response.status_code == 400

    def test_valid_tweet_create_events_returns_200(self):
        body = json.dumps(
            {
                "for_user_id": "3198576760",
                "tweet_create_events": [{"id_str": "1", "text": "hello"}],
            }
        ).encode("utf-8")
        sig = generate_signature(body, CONSUMER_SECRET)

        response = client.post(
            "/webhooks/twitter",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-twitter-webhooks-signature": sig,
            },
        )
        assert response.status_code == 200
        assert response.text == "OK"

    def test_valid_follow_events_returns_200(self):
        body = json.dumps(
            {
                "for_user_id": "3198576760",
                "follow_events": [
                    {"type": "follow", "source": {"id": "1"}, "target": {"id": "2"}}
                ],
            }
        ).encode("utf-8")
        sig = generate_signature(body, CONSUMER_SECRET)

        response = client.post(
            "/webhooks/twitter",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-twitter-webhooks-signature": sig,
            },
        )
        assert response.status_code == 200

    def test_valid_direct_message_events_returns_200(self):
        body = json.dumps(
            {
                "for_user_id": "3198576760",
                "direct_message_events": [{"type": "message_create"}],
            }
        ).encode("utf-8")
        sig = generate_signature(body, CONSUMER_SECRET)

        response = client.post(
            "/webhooks/twitter",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-twitter-webhooks-signature": sig,
            },
        )
        assert response.status_code == 200

    def test_invalid_json_returns_400(self):
        body = b"not valid json"
        sig = generate_signature(body, CONSUMER_SECRET)

        response = client.post(
            "/webhooks/twitter",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-twitter-webhooks-signature": sig,
            },
        )
        assert response.status_code == 400


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
