import os
import json
import time
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["AKENEO_WEBHOOK_SECRET"] = "test_akeneo_secret"

from main import app, verify_akeneo_webhook

client = TestClient(app)

SECRET = os.environ["AKENEO_WEBHOOK_SECRET"]


def now() -> str:
    return str(int(time.time()))


def generate_akeneo_signature(payload: str, secret: str, timestamp: str) -> str:
    """Generate a valid Akeneo signature for testing."""
    signed_content = timestamp.encode("utf-8") + b"." + payload.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()


def sample_payload(action: str = "product.updated") -> str:
    return json.dumps(
        {
            "events": [
                {
                    "action": action,
                    "event_id": "evt_test_123",
                    "event_datetime": "2024-06-01T12:34:56+00:00",
                    "author": "julia",
                    "author_type": "ui",
                    "pim_source": "https://demo.akeneo.com",
                    "data": {"resource": {"identifier": "top-sku-001", "code": "model-001"}},
                }
            ]
        }
    )


class TestVerifyAkeneoWebhook:
    def test_valid_signature_returns_true(self):
        ts = now()
        payload = sample_payload()
        sig = generate_akeneo_signature(payload, SECRET, ts)
        assert verify_akeneo_webhook(payload.encode(), sig, ts, SECRET) is True

    def test_invalid_signature_returns_false(self):
        ts = now()
        assert verify_akeneo_webhook(sample_payload().encode(), "deadbeef", ts, SECRET) is False

    def test_missing_signature_returns_false(self):
        assert verify_akeneo_webhook(sample_payload().encode(), None, now(), SECRET) is False

    def test_missing_timestamp_returns_false(self):
        payload = sample_payload()
        sig = generate_akeneo_signature(payload, SECRET, now())
        assert verify_akeneo_webhook(payload.encode(), sig, None, SECRET) is False

    def test_tampered_payload_returns_false(self):
        ts = now()
        sig = generate_akeneo_signature(sample_payload("product.created"), SECRET, ts)
        assert verify_akeneo_webhook(sample_payload("product.removed").encode(), sig, ts, SECRET) is False

    def test_stale_timestamp_returns_false(self):
        stale_ts = str(int(time.time()) - 3600)
        payload = sample_payload()
        sig = generate_akeneo_signature(payload, SECRET, stale_ts)
        assert verify_akeneo_webhook(payload.encode(), sig, stale_ts, SECRET) is False

    def test_wrong_secret_returns_false(self):
        ts = now()
        payload = sample_payload()
        sig = generate_akeneo_signature(payload, SECRET, ts)
        assert verify_akeneo_webhook(payload.encode(), sig, ts, "wrong_secret") is False


class TestAkeneoWebhookEndpoint:
    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/akeneo",
            content=sample_payload(),
            headers={
                "Content-Type": "application/json",
                "x-akeneo-request-timestamp": now(),
            },
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        response = client.post(
            "/webhooks/akeneo",
            content=sample_payload(),
            headers={
                "Content-Type": "application/json",
                "x-akeneo-request-signature": "invalid",
                "x-akeneo-request-timestamp": now(),
            },
        )
        assert response.status_code == 401

    def test_tampered_payload_returns_401(self):
        ts = now()
        sig = generate_akeneo_signature(sample_payload("product.created"), SECRET, ts)
        response = client.post(
            "/webhooks/akeneo",
            content=sample_payload("product.removed"),
            headers={
                "Content-Type": "application/json",
                "x-akeneo-request-signature": sig,
                "x-akeneo-request-timestamp": ts,
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        ts = now()
        payload = sample_payload()
        sig = generate_akeneo_signature(payload, SECRET, ts)
        response = client.post(
            "/webhooks/akeneo",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-akeneo-request-signature": sig,
                "x-akeneo-request-timestamp": ts,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_all_event_types(self):
        actions = [
            "product.created",
            "product.updated",
            "product.removed",
            "product_model.created",
            "product_model.updated",
            "product_model.removed",
            "unknown.action",
        ]
        for action in actions:
            ts = now()
            payload = sample_payload(action)
            sig = generate_akeneo_signature(payload, SECRET, ts)
            response = client.post(
                "/webhooks/akeneo",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-akeneo-request-signature": sig,
                    "x-akeneo-request-timestamp": ts,
                },
            )
            assert response.status_code == 200

    def test_processes_batched_events(self):
        ts = now()
        payload = json.dumps(
            {
                "events": [
                    {"action": "product.created", "event_id": "e1", "data": {"resource": {"identifier": "a"}}},
                    {"action": "product.updated", "event_id": "e2", "data": {"resource": {"identifier": "b"}}},
                ]
            }
        )
        sig = generate_akeneo_signature(payload, SECRET, ts)
        response = client.post(
            "/webhooks/akeneo",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-akeneo-request-signature": sig,
                "x-akeneo-request-timestamp": ts,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
