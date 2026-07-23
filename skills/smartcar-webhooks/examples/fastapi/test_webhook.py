import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

# Set the test environment variable before importing the app
os.environ["SMARTCAR_MANAGEMENT_TOKEN"] = "test-application-management-token"

from main import app  # noqa: E402

client = TestClient(app)

AMT = os.environ["SMARTCAR_MANAGEMENT_TOKEN"]


def sign(raw_body: str) -> str:
    """Sign a raw body like Smartcar: hex HMAC-SHA256 keyed with the AMT."""
    return hmac.new(AMT.encode(), raw_body.encode(), hashlib.sha256).hexdigest()


VEHICLE_STATE = {
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "eventType": "VEHICLE_STATE",
    "vehicleId": "9af13248-3b73-4c9d-9a4b-d937ce6bc8e2",
    "data": {
        "triggers": [
            {"code": "tractionbattery-stateofcharge", "name": "StateOfCharge", "group": "TractionBattery"}
        ],
        "signals": [
            {
                "code": "tractionbattery-stateofcharge",
                "name": "StateOfCharge",
                "group": "TractionBattery",
                "body": {"unit": "percent", "value": 78},
            }
        ],
    },
    "meta": {"version": "4.0", "deliveryId": "48b25f8f-9fea-42e1-9085-81043682cbb8", "mode": "LIVE"},
}

VEHICLE_ERROR = {
    "eventId": "5a537912-9ad3-424b-ba33-65a1704567e9",
    "eventType": "VEHICLE_ERROR",
    "vehicleId": "123e4567-e89b-12d3-a456-426614174000",
    "data": {"errors": [{"type": "COMPATIBILITY", "code": "VEHICLE_NOT_CAPABLE", "state": "ERROR"}]},
    "meta": {"version": "4.0", "deliveryId": "48b25f8f-9fea-42e1-9085-81043682cbb8", "mode": "LIVE"},
}


class TestVerifyChallenge:
    def test_verify_returns_hashed_challenge(self):
        challenge = "3a5c8f72-e6d9-4b1a-9f2e-8c7d6a5b4e3f"
        payload = json.dumps(
            {"eventId": "evt_verify", "eventType": "VERIFY", "data": {"challenge": challenge}, "meta": {"version": "4.0"}}
        )

        response = client.post(
            "/webhooks/smartcar", content=payload, headers={"Content-Type": "application/json"}
        )

        expected = hmac.new(AMT.encode(), challenge.encode(), hashlib.sha256).hexdigest()
        assert response.status_code == 200
        assert response.json() == {"challenge": expected}


class TestDataEvents:
    def test_valid_vehicle_state_returns_200(self):
        payload = json.dumps(VEHICLE_STATE)
        response = client.post(
            "/webhooks/smartcar",
            content=payload,
            headers={"Content-Type": "application/json", "SC-Signature": sign(payload)},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_vehicle_error_returns_200(self):
        payload = json.dumps(VEHICLE_ERROR)
        response = client.post(
            "/webhooks/smartcar",
            content=payload,
            headers={"Content-Type": "application/json", "SC-Signature": sign(payload)},
        )
        assert response.status_code == 200

    def test_missing_signature_returns_401(self):
        payload = json.dumps(VEHICLE_STATE)
        response = client.post(
            "/webhooks/smartcar", content=payload, headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        payload = json.dumps(VEHICLE_STATE)
        response = client.post(
            "/webhooks/smartcar",
            content=payload,
            headers={"Content-Type": "application/json", "SC-Signature": "deadbeef"},
        )
        assert response.status_code == 401

    def test_tampered_payload_returns_401(self):
        signature = sign(json.dumps(VEHICLE_STATE))
        tampered = json.dumps({**VEHICLE_STATE, "vehicleId": "attacker-controlled-id"})
        response = client.post(
            "/webhooks/smartcar",
            content=tampered,
            headers={"Content-Type": "application/json", "SC-Signature": signature},
        )
        assert response.status_code == 401


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
