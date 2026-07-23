import os
import time
import pytest
import jwt
from fastapi.testclient import TestClient

# Set test environment variables before importing app
TEST_SECRET = "test_monday_signing_secret"
os.environ["MONDAY_SIGNING_SECRET"] = TEST_SECRET

from main import app

client = TestClient(app)


def generate_monday_jwt(secret: str, **claims) -> str:
    """Generate a valid monday.com Authorization JWT (HS256) for testing."""
    now = int(time.time())
    payload = {
        "accountId": 123,
        "userId": 456,
        "iat": now,
        "exp": now + 300,
        **claims,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def event_body(event_type: str, **extra) -> dict:
    return {
        "event": {
            "type": event_type,
            "userId": 456,
            "boardId": 1771812698,
            "pulseId": 1772099344,
            "pulseName": "Test item",
            "triggerUuid": "b12b4f2b58e83e2b4b6e2f7e6f4b1a2c",
            **extra,
        }
    }


class TestChallengeHandshake:
    def test_echoes_challenge_token(self):
        """Should echo the challenge token with 200, no JWT required."""
        challenge = "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P"
        response = client.post("/webhooks/monday", json={"challenge": challenge})
        assert response.status_code == 200
        assert response.json() == {"challenge": challenge}


class TestMondayWebhook:
    def test_missing_authorization_returns_401(self):
        response = client.post("/webhooks/monday", json=event_body("create_item"))
        assert response.status_code == 401

    def test_invalid_jwt_returns_401(self):
        response = client.post(
            "/webhooks/monday",
            json=event_body("create_item"),
            headers={"Authorization": "invalid.jwt.token"},
        )
        assert response.status_code == 401

    def test_wrong_secret_returns_401(self):
        token = generate_monday_jwt("wrong_secret")
        response = client.post(
            "/webhooks/monday",
            json=event_body("create_item"),
            headers={"Authorization": token},
        )
        assert response.status_code == 401

    def test_valid_jwt_returns_200(self):
        token = generate_monday_jwt(TEST_SECRET)
        response = client.post(
            "/webhooks/monday",
            json=event_body("create_item"),
            headers={"Authorization": token},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_bearer_prefixed_token(self):
        token = generate_monday_jwt(TEST_SECRET)
        response = client.post(
            "/webhooks/monday",
            json=event_body("create_item"),
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

    def test_handles_different_event_types(self):
        token = generate_monday_jwt(TEST_SECRET)
        event_types = [
            "create_item",
            "change_column_value",
            "change_status_column_value",
            "change_name",
            "create_update",
            "create_subitem",
            "item_archived",
            "item_deleted",
            "unknown_event_type",
        ]
        for event_type in event_types:
            response = client.post(
                "/webhooks/monday",
                json=event_body(event_type, parentItemId=999),
                headers={"Authorization": token},
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
