import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["STRAVA_VERIFY_TOKEN"] = "test_verify_token"
os.environ["STRAVA_SUBSCRIPTION_ID"] = "120475"

from main import app

client = TestClient(app)


def base_event(**overrides):
    event = {
        "object_type": "activity",
        "object_id": 1360128428,
        "aspect_type": "create",
        "owner_id": 134815,
        "subscription_id": 120475,
        "event_time": 1516126040,
        "updates": {},
    }
    event.update(overrides)
    return event


class TestSubscriptionValidation:
    """GET /webhooks/strava — subscription validation handshake."""

    def test_echoes_challenge_for_valid_token(self):
        response = client.get(
            "/webhooks/strava",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "test_verify_token",
                "hub.challenge": "abc123challenge",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"hub.challenge": "abc123challenge"}

    def test_rejects_invalid_token(self):
        response = client.get(
            "/webhooks/strava",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong_token",
                "hub.challenge": "abc123challenge",
            },
        )
        assert response.status_code == 403

    def test_rejects_non_subscribe_mode(self):
        response = client.get(
            "/webhooks/strava",
            params={
                "hub.mode": "unsubscribe",
                "hub.verify_token": "test_verify_token",
                "hub.challenge": "abc123challenge",
            },
        )
        assert response.status_code == 403


class TestEventDelivery:
    """POST /webhooks/strava — events."""

    def test_valid_activity_create_returns_200(self):
        response = client.post("/webhooks/strava", json=base_event())
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_all_event_combinations(self):
        cases = [
            {"object_type": "activity", "aspect_type": "create"},
            {"object_type": "activity", "aspect_type": "update", "updates": {"title": "New title"}},
            {"object_type": "activity", "aspect_type": "delete"},
            {"object_type": "athlete", "aspect_type": "update", "updates": {"authorized": "false"}},
        ]
        for case in cases:
            response = client.post("/webhooks/strava", json=base_event(**case))
            assert response.status_code == 200, f"Failed for {case}"

    def test_rejects_unknown_subscription_id(self):
        response = client.post("/webhooks/strava", json=base_event(subscription_id=999999))
        assert response.status_code == 403


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
