import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["SYNCTERA_WEBHOOK_SECRET"] = "test_signature_secret"

from main import app

client = TestClient(app)

WEBHOOK_SECRET = os.environ["SYNCTERA_WEBHOOK_SECRET"]


def sign(payload: str, secret: str, timestamp: int) -> str:
    """Generate a valid Synctera signature for testing."""
    signed = f"{timestamp}.{payload}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()


def headers(payload: str, secret: str, timestamp: int | None = None) -> dict:
    ts = timestamp if timestamp is not None else int(time.time())
    return {
        "Content-Type": "application/json",
        "Synctera-Signature": sign(payload, secret, ts),
        "Request-Timestamp": str(ts),
    }


class TestSyncteraWebhook:
    def test_missing_headers_returns_400(self):
        response = client.post(
            "/webhooks/synctera",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing signature headers" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"type": "ACCOUNT.UPDATED", "id": "acc_1"})
        response = client.post(
            "/webhooks/synctera",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Synctera-Signature": "deadbeef",
                "Request-Timestamp": str(int(time.time())),
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original = json.dumps({"type": "TRANSACTIONS.POSTED.CREATED", "id": "txn_1"})
        tampered = json.dumps({"type": "TRANSACTIONS.POSTED.CREATED", "id": "txn_evil"})
        ts = int(time.time())
        response = client.post(
            "/webhooks/synctera",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "Synctera-Signature": sign(original, WEBHOOK_SECRET, ts),
                "Request-Timestamp": str(ts),
            },
        )
        assert response.status_code == 400

    def test_stale_timestamp_returns_400(self):
        payload = json.dumps({"type": "ACCOUNT.UPDATED", "id": "acc_1"})
        old_ts = int(time.time()) - 600  # 10 minutes ago
        response = client.post(
            "/webhooks/synctera",
            content=payload,
            headers=headers(payload, WEBHOOK_SECRET, old_ts),
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps({"type": "ACCOUNT.UPDATED", "id": "acc_1"})
        response = client.post(
            "/webhooks/synctera",
            content=payload,
            headers=headers(payload, WEBHOOK_SECRET),
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_rolling_secret_two_signatures(self):
        payload = json.dumps({"type": "TRANSACTIONS.POSTED.CREATED", "id": "txn_1"})
        ts = int(time.time())
        rotated = f"{'0' * 64}.{sign(payload, WEBHOOK_SECRET, ts)}"
        response = client.post(
            "/webhooks/synctera",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Synctera-Signature": rotated,
                "Request-Timestamp": str(ts),
            },
        )
        assert response.status_code == 200

    def test_handles_different_event_types(self):
        # Only the first two are verified event names; the rest exercise the
        # default (unhandled) path.
        event_types = [
            "ACCOUNT.UPDATED",
            "TRANSACTIONS.POSTED.CREATED",
            "UNKNOWN.EVENT",
        ]
        for event_type in event_types:
            payload = json.dumps({"type": event_type, "id": "obj_123"})
            response = client.post(
                "/webhooks/synctera",
                content=payload,
                headers=headers(payload, WEBHOOK_SECRET),
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
