import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["STATSIG_WEBHOOK_SECRET"] = "test_statsig_secret"

from main import app

client = TestClient(app)


def generate_statsig_signature(raw_body: str, timestamp: str, secret: str) -> str:
    """Generate a valid Statsig signature for testing."""
    basestring = f"v0:{timestamp}:{raw_body}".encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), basestring, hashlib.sha256).hexdigest()
    return f"v0={signature}"


class TestStatsigWebhook:
    """Tests for Statsig webhook endpoint."""

    webhook_secret = os.environ["STATSIG_WEBHOOK_SECRET"]
    timestamp = "1655231253265"

    def test_missing_signature_returns_401(self):
        """Should return 401 when signature header is missing."""
        response = client.post(
            "/webhooks/statsig",
            content='{"data":[]}',
            headers={
                "Content-Type": "application/json",
                "X-Statsig-Request-Timestamp": self.timestamp,
            },
        )
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        """Should return 401 when signature is invalid."""
        payload = json.dumps({"data": [{"eventName": "statsig::gate_exposure"}]})
        response = client.post(
            "/webhooks/statsig",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Statsig-Request-Timestamp": self.timestamp,
                "X-Statsig-Signature": "v0=invalid_signature",
            },
        )
        assert response.status_code == 401

    def test_tampered_payload_returns_401(self):
        """Should return 401 when the payload is tampered after signing."""
        original = json.dumps({"data": [{"eventName": "statsig::gate_exposure"}]})
        signature = generate_statsig_signature(original, self.timestamp, self.webhook_secret)
        tampered = json.dumps({"data": [{"eventName": "statsig::config_change"}]})
        response = client.post(
            "/webhooks/statsig",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "X-Statsig-Request-Timestamp": self.timestamp,
                "X-Statsig-Signature": signature,
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        """Should return 200 when signature is valid."""
        payload = json.dumps({
            "data": [{"eventName": "statsig::gate_exposure", "metadata": {"gate": "a_gate"}}]
        })
        signature = generate_statsig_signature(payload, self.timestamp, self.webhook_secret)
        response = client.post(
            "/webhooks/statsig",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Statsig-Request-Timestamp": self.timestamp,
                "X-Statsig-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_event_types(self):
        """Should handle various Statsig event types."""
        event_names = [
            "statsig::gate_exposure",
            "statsig::config_exposure",
            "statsig::experiment_exposure",
            "statsig::config_change",
            "my_custom_event",
        ]
        for event_name in event_names:
            payload = json.dumps({"data": [{"eventName": event_name, "metadata": {}}]})
            signature = generate_statsig_signature(payload, self.timestamp, self.webhook_secret)
            response = client.post(
                "/webhooks/statsig",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Statsig-Request-Timestamp": self.timestamp,
                    "X-Statsig-Signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event: {event_name}"


class TestHealth:
    """Tests for health endpoint."""

    def test_health_returns_ok(self):
        """Should return health status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
