import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["STATSIG_WEBHOOK_SECRET"] = "test_statsig_signing_secret"

from main import app, verify_statsig_request  # noqa: E402

client = TestClient(app)

SIGNING_SECRET = os.environ["STATSIG_WEBHOOK_SECRET"]


def generate_statsig_signature(body: bytes, timestamp: str, secret: str) -> str:
    """Generate a valid Statsig signature for testing."""
    basestring = f"v0:{timestamp}:{body.decode('utf-8')}".encode("utf-8")
    return "v0=" + hmac.new(
        secret.encode("utf-8"),
        basestring,
        hashlib.sha256,
    ).hexdigest()


def current_timestamp() -> str:
    # Statsig timestamps are in MILLISECONDS
    return str(int(time.time() * 1000))


class TestVerifyStatsigRequest:
    def test_valid_signature_returns_true(self):
        body = b'{"data":[]}'
        ts = current_timestamp()
        sig = generate_statsig_signature(body, ts, SIGNING_SECRET)

        assert verify_statsig_request(body, sig, ts, SIGNING_SECRET) is True

    def test_invalid_signature_returns_false(self):
        body = b'{"data":[]}'
        ts = current_timestamp()

        assert verify_statsig_request(body, "v0=deadbeef", ts, SIGNING_SECRET) is False

    def test_missing_signature_returns_false(self):
        ts = current_timestamp()
        assert verify_statsig_request(b"{}", None, ts, SIGNING_SECRET) is False

    def test_missing_timestamp_returns_false(self):
        body = b"{}"
        sig = generate_statsig_signature(body, current_timestamp(), SIGNING_SECRET)
        assert verify_statsig_request(body, sig, None, SIGNING_SECRET) is False

    def test_stale_timestamp_returns_false(self):
        body = b"{}"
        stale = str(int(time.time() * 1000) - 6 * 60 * 1000)
        sig = generate_statsig_signature(body, stale, SIGNING_SECRET)

        assert verify_statsig_request(body, sig, stale, SIGNING_SECRET) is False

    def test_tampered_body_returns_false(self):
        original = b'{"data":[{"metadata":{"action":"created"}}]}'
        tampered = b'{"data":[{"metadata":{"action":"updated"}}]}'
        ts = current_timestamp()
        sig = generate_statsig_signature(original, ts, SIGNING_SECRET)

        assert verify_statsig_request(tampered, sig, ts, SIGNING_SECRET) is False

    def test_wrong_secret_returns_false(self):
        body = b"{}"
        ts = current_timestamp()
        sig = generate_statsig_signature(body, ts, SIGNING_SECRET)

        assert verify_statsig_request(body, sig, ts, "wrong_secret") is False

    def test_non_numeric_timestamp_returns_false(self):
        body = b"{}"
        sig = generate_statsig_signature(body, "1671672194836", SIGNING_SECRET)

        assert verify_statsig_request(body, sig, "not-a-number", SIGNING_SECRET) is False


class TestStatsigWebhookEndpoint:
    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/statsig",
            content='{"data":[]}',
            headers={
                "Content-Type": "application/json",
                "X-Statsig-Request-Timestamp": current_timestamp(),
            },
        )
        assert response.status_code == 401
        assert response.text == "Invalid signature"

    def test_invalid_signature_returns_401(self):
        body = b'{"data":[]}'
        ts = current_timestamp()

        response = client.post(
            "/webhooks/statsig",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Statsig-Signature": "v0=invalid",
                "X-Statsig-Request-Timestamp": ts,
            },
        )
        assert response.status_code == 401

    def test_config_change_batch_returns_200(self):
        body = json.dumps(
            {
                "data": [
                    {
                        "eventName": "statsig::config_change",
                        "timestamp": 1671672194836,
                        "metadata": {
                            "type": "Feature Gate",
                            "name": "my_feature_gate",
                            "description": "Enabled the gate for the beta segment",
                            "action": "updated",
                        },
                    }
                ]
            }
        ).encode("utf-8")
        ts = current_timestamp()
        sig = generate_statsig_signature(body, ts, SIGNING_SECRET)

        response = client.post(
            "/webhooks/statsig",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Statsig-Signature": sig,
                "X-Statsig-Request-Timestamp": ts,
            },
        )
        assert response.status_code == 200
        assert response.text == "OK"

    def test_exposure_array_batch_returns_200(self):
        body = json.dumps(
            [
                {
                    "eventName": "my_feature_gate",
                    "user": {"userID": "user-123"},
                    "timestamp": 1671672194836,
                    "metadata": {"gate": "my_feature_gate", "gateValue": "true"},
                }
            ]
        ).encode("utf-8")
        ts = current_timestamp()
        sig = generate_statsig_signature(body, ts, SIGNING_SECRET)

        response = client.post(
            "/webhooks/statsig",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Statsig-Signature": sig,
                "X-Statsig-Request-Timestamp": ts,
            },
        )
        assert response.status_code == 200

    def test_url_verification_handshake_answered_without_signature(self):
        body = b'{"data": {"event": "url_verification", "verification_code": "test_code_123"}}'

        response = client.post(
            "/webhooks/statsig",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200
        assert response.json() == {"verification_code": "test_code_123"}

    def test_invalid_json_returns_400(self):
        body = b"not valid json"
        ts = current_timestamp()
        sig = generate_statsig_signature(body, ts, SIGNING_SECRET)

        response = client.post(
            "/webhooks/statsig",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Statsig-Signature": sig,
                "X-Statsig-Request-Timestamp": ts,
            },
        )
        assert response.status_code == 400


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
