import os
import json
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["MERAKI_WEBHOOK_SECRET"] = "test_shared_secret"

from main import app, verify_meraki_webhook

client = TestClient(app)

SECRET = os.environ["MERAKI_WEBHOOK_SECRET"]


def build_payload(shared_secret=SECRET, alert_type_id="motion_alert", alert_type="Motion detected"):
    """Build a Meraki-style payload."""
    return json.dumps({
        "version": "0.1",
        "sharedSecret": shared_secret,
        "sentAt": "2026-07-23T18:04:20.123Z",
        "occurredAt": "2026-07-23T18:02:53.000Z",
        "organizationId": "2930418",
        "networkId": "N_24329156",
        "networkName": "Main Office",
        "deviceSerial": "Q234-ABCD-5678",
        "alertId": "0000000000000000",
        "alertType": alert_type,
        "alertTypeId": alert_type_id,
        "alertData": {},
    })


class TestVerifyMerakiWebhook:
    """Tests for the sharedSecret verification function."""

    def test_matching_secret_returns_true(self):
        assert verify_meraki_webhook(build_payload().encode(), SECRET) is True

    def test_mismatched_secret_returns_false(self):
        body = build_payload(shared_secret="wrong").encode()
        assert verify_meraki_webhook(body, SECRET) is False

    def test_missing_secret_returns_false(self):
        body = json.dumps({"alertTypeId": "motion_alert"}).encode()
        assert verify_meraki_webhook(body, SECRET) is False

    def test_non_json_body_returns_false(self):
        assert verify_meraki_webhook(b"not json", SECRET) is False

    def test_no_configured_secret_accepts_and_warns(self, capsys):
        """Meraki's shared secret is optional: unset means TLS-only, not fail-open silently."""
        import main

        main._warned_no_secret_configured = False
        body = json.dumps({"alertTypeId": "motion_alert"}).encode()
        assert verify_meraki_webhook(body, "") is True
        assert "MERAKI_WEBHOOK_SECRET is not set" in capsys.readouterr().out


class TestMerakiWebhook:
    """Tests for the webhook endpoint."""

    def _post(self, body):
        return client.post(
            "/webhooks/meraki",
            content=body,
            headers={"Content-Type": "application/json"},
        )

    def test_missing_secret_returns_401(self):
        response = self._post(json.dumps({"alertTypeId": "motion_alert"}))
        assert response.status_code == 401
        assert "Missing or invalid sharedSecret" in response.json()["detail"]

    def test_wrong_secret_returns_401(self):
        response = self._post(build_payload(shared_secret="wrong"))
        assert response.status_code == 401

    def test_valid_motion_alert_returns_200(self):
        response = self._post(build_payload(alert_type_id="motion_alert", alert_type="Motion detected"))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_settings_changed(self):
        response = self._post(build_payload(alert_type_id="settings_changed", alert_type="Settings changed"))
        assert response.status_code == 200

    def test_handles_sensor_alert(self):
        response = self._post(build_payload(alert_type_id="sensor_alert", alert_type="Sensor change detected"))
        assert response.status_code == 200

    def test_handles_stopped_reporting(self):
        response = self._post(build_payload(alert_type_id="stopped_reporting", alert_type="APs went down"))
        assert response.status_code == 200

    def test_unhandled_alert_type_returns_200(self):
        response = self._post(build_payload(alert_type_id="some_new_alert", alert_type="Something new"))
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
