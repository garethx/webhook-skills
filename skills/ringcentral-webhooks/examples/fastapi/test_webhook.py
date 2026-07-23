import os
import json

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["RINGCENTRAL_VERIFICATION_TOKEN"] = "test_verification_token"

from main import app, token_matches, event_category

client = TestClient(app)

EXPECTED_TOKEN = os.environ["RINGCENTRAL_VERIFICATION_TOKEN"]

NOTIFICATION = {
    "uuid": "a7c1f0e2-1234",
    "event": "/restapi/v1.0/account/111/extension/222/message-store",
    "timestamp": "2024-01-15T10:00:00.000Z",
    "subscriptionId": "sub-1",
    "ownerId": "222",
    "body": {"changes": [{"type": "SMS", "newCount": 1}]},
}


class TestTokenMatches:
    def test_matching_token_returns_true(self):
        assert token_matches(EXPECTED_TOKEN, EXPECTED_TOKEN) is True

    def test_different_token_returns_false(self):
        assert token_matches("wrong_token", EXPECTED_TOKEN) is False

    def test_missing_token_returns_false(self):
        assert token_matches(None, EXPECTED_TOKEN) is False


class TestEventCategory:
    def test_instant_message(self):
        assert (
            event_category(
                "/restapi/v1.0/account/1/extension/2/message-store/instant?type=SMS"
            )
            == "instant-message"
        )

    def test_message_store(self):
        assert (
            event_category("/restapi/v1.0/account/1/extension/2/message-store")
            == "message-store"
        )

    def test_presence(self):
        assert (
            event_category("/restapi/v1.0/account/1/extension/2/presence") == "presence"
        )

    def test_telephony_session(self):
        assert (
            event_category("/restapi/v1.0/account/1/telephony/sessions")
            == "telephony-session"
        )

    def test_extension(self):
        assert event_category("/restapi/v1.0/account/1/extension") == "extension"

    def test_empty_returns_unknown(self):
        assert event_category("") == "unknown"


class TestHandshake:
    def test_echoes_validation_token_and_returns_200(self):
        response = client.post(
            "/webhooks/ringcentral",
            headers={"Validation-Token": "handshake-abc"},
        )
        assert response.status_code == 200
        assert response.headers["Validation-Token"] == "handshake-abc"


class TestNotifications:
    def test_valid_verification_token_returns_200(self):
        response = client.post(
            "/webhooks/ringcentral",
            content=json.dumps(NOTIFICATION),
            headers={
                "Content-Type": "application/json",
                "Verification-Token": EXPECTED_TOKEN,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_invalid_verification_token_returns_401(self):
        response = client.post(
            "/webhooks/ringcentral",
            content=json.dumps(NOTIFICATION),
            headers={
                "Content-Type": "application/json",
                "Verification-Token": "wrong_token",
            },
        )
        assert response.status_code == 401

    def test_missing_verification_token_returns_401(self):
        response = client.post(
            "/webhooks/ringcentral",
            content=json.dumps(NOTIFICATION),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_handles_telephony_session(self):
        payload = dict(
            NOTIFICATION,
            event="/restapi/v1.0/account/111/telephony/sessions",
            body={"telephonyStatus": "CallConnected"},
        )
        response = client.post(
            "/webhooks/ringcentral",
            content=json.dumps(payload),
            headers={
                "Content-Type": "application/json",
                "Verification-Token": EXPECTED_TOKEN,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
