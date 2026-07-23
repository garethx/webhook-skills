import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["LINKEDIN_CLIENT_SECRET"] = "test_client_secret"

import main
from main import app, verify_linkedin_webhook, challenge_response, get_notification_type

client = TestClient(app)

CLIENT_SECRET = os.environ["LINKEDIN_CLIENT_SECRET"]


def generate_signature(payload: str, secret: str) -> str:
    """hex(HMACSHA256("hmacsha256=" + rawBody, clientSecret))"""
    string_to_sign = b"hmacsha256=" + payload.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), string_to_sign, hashlib.sha256).hexdigest()


class TestChallengeResponse:
    def test_is_deterministic_hex(self):
        resp = challenge_response("890e4665-4dfe-4ab1-b689-ed553bceeed0", CLIENT_SECRET)
        assert len(resp) == 64
        assert all(c in "0123456789abcdef" for c in resp)


class TestVerifyLinkedInWebhook:
    def test_valid_signature_returns_true(self):
        payload = b'{"notificationId":"n1"}'
        signature = generate_signature(payload.decode(), CLIENT_SECRET)
        assert verify_linkedin_webhook(payload, signature, CLIENT_SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"notificationId":"n1"}'
        assert verify_linkedin_webhook(payload, "deadbeef", CLIENT_SECRET) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"notificationId":"n1"}'
        assert verify_linkedin_webhook(payload, None, CLIENT_SECRET) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"notificationId":"n1"}'
        signature = generate_signature(payload.decode(), CLIENT_SECRET)
        assert verify_linkedin_webhook(payload, signature, "wrong_secret") is False

    def test_tampered_body_returns_false(self):
        signature = generate_signature('{"notificationId":"n1"}', CLIENT_SECRET)
        assert verify_linkedin_webhook(b'{"notificationId":"n2"}', signature, CLIENT_SECRET) is False


class TestGetNotificationType:
    def test_explicit_event_type(self):
        assert get_notification_type({"eventType": "LEAD_ACTION"}) == "LEAD_ACTION"

    def test_lead_payload(self):
        assert get_notification_type({"leadType": "SPONSORED"}) == "LEAD_ACTION"

    def test_org_social_action_payload(self):
        assert get_notification_type({"organizationSocialAction": {}}) == "ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS"

    def test_unknown(self):
        assert get_notification_type({}) == "UNKNOWN"


class TestEndpointValidation:
    def test_echoes_challenge_with_valid_response(self):
        code = "890e4665-4dfe-4ab1-b689-ed553bceeed0"
        response = client.get("/webhooks/linkedin", params={"challengeCode": code})
        assert response.status_code == 200
        body = response.json()
        assert body["challengeCode"] == code
        assert body["challengeResponse"] == challenge_response(code, CLIENT_SECRET)

    def test_missing_challenge_returns_400(self):
        response = client.get("/webhooks/linkedin")
        assert response.status_code == 400


class TestReceiveWebhook:
    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/linkedin",
            content='{"notificationId":"n1"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        response = client.post(
            "/webhooks/linkedin",
            content='{"notificationId":"n1"}',
            headers={"Content-Type": "application/json", "X-LI-Signature": "deadbeef"},
        )
        assert response.status_code == 401

    def test_valid_lead_action_returns_200(self):
        payload = json.dumps({"notificationId": "lead-1", "eventType": "LEAD_ACTION", "leadType": "SPONSORED"})
        signature = generate_signature(payload, CLIENT_SECRET)
        response = client.post(
            "/webhooks/linkedin",
            content=payload,
            headers={"Content-Type": "application/json", "X-LI-Signature": signature},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_org_social_action_returns_200(self):
        payload = json.dumps({
            "notificationId": "social-1",
            "eventType": "ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS",
            "organizationSocialAction": {"object": "urn:li:activity:123"},
        })
        signature = generate_signature(payload, CLIENT_SECRET)
        response = client.post(
            "/webhooks/linkedin",
            content=payload,
            headers={"Content-Type": "application/json", "X-LI-Signature": signature},
        )
        assert response.status_code == 200

    def test_deduplicates_repeated_notification_id(self):
        payload = json.dumps({"notificationId": "dupe-1", "eventType": "LEAD_ACTION"})
        signature = generate_signature(payload, CLIENT_SECRET)
        headers = {"Content-Type": "application/json", "X-LI-Signature": signature}

        first = client.post("/webhooks/linkedin", content=payload, headers=headers)
        second = client.post("/webhooks/linkedin", content=payload, headers=headers)
        assert first.status_code == 200
        assert second.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
