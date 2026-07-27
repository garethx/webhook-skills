import base64
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["ETHOCA_WEBHOOK_USERNAME"] = "test_user"
os.environ["ETHOCA_WEBHOOK_PASSWORD"] = "test_pass:with:colons"

from main import app, verify_ethoca_auth, alert_category

client = TestClient(app)

USER = os.environ["ETHOCA_WEBHOOK_USERNAME"]
PASS = os.environ["ETHOCA_WEBHOOK_PASSWORD"]

ALERT = {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "alertType": "fraud",
    "transaction": {"arn": "74987654321098765432109", "amount": "125.00", "currency": "USD"},
}


def basic_auth(username: str, password: str) -> str:
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("utf-8")
    return f"Basic {token}"


class TestVerifyEthocaAuth:
    def test_valid_credentials(self):
        assert verify_ethoca_auth(basic_auth(USER, PASS), USER, PASS) is True

    def test_wrong_password(self):
        assert verify_ethoca_auth(basic_auth(USER, "nope"), USER, PASS) is False

    def test_wrong_username(self):
        assert verify_ethoca_auth(basic_auth("someone", PASS), USER, PASS) is False

    def test_missing_header(self):
        assert verify_ethoca_auth("", USER, PASS) is False

    def test_non_basic_scheme(self):
        assert verify_ethoca_auth("Bearer token", USER, PASS) is False

    def test_password_with_colons(self):
        # PASS contains colons — must split on the FIRST colon only
        assert verify_ethoca_auth(basic_auth(USER, PASS), USER, PASS) is True


class TestAlertCategory:
    def test_string_types(self):
        assert alert_category("fraud") == "fraud"
        assert alert_category("dispute") == "dispute"

    def test_numeric_types(self):
        assert alert_category(1) == "fraud"
        assert alert_category(2) == "dispute"

    def test_unknown(self):
        assert alert_category("other") == "unknown"


class TestEthocaWebhook:
    def test_missing_auth_returns_401(self):
        response = client.post("/webhooks/ethoca", json=ALERT)
        assert response.status_code == 401

    def test_invalid_credentials_returns_401(self):
        response = client.post(
            "/webhooks/ethoca",
            json=ALERT,
            headers={"Authorization": basic_auth(USER, "wrong")},
        )
        assert response.status_code == 401

    def test_valid_credentials_returns_200(self):
        response = client.post(
            "/webhooks/ethoca",
            json=ALERT,
            headers={"Authorization": basic_auth(USER, PASS)},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_fraud_and_dispute(self):
        for alert_type in ["fraud", "dispute"]:
            payload = {**ALERT, "alertType": alert_type}
            response = client.post(
                "/webhooks/ethoca",
                json=payload,
                headers={"Authorization": basic_auth(USER, PASS)},
            )
            assert response.status_code == 200, f"Failed for alertType: {alert_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
