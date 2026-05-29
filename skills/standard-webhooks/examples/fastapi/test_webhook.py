import base64
import hashlib
import hmac
import json
import os
import secrets
import time

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("WEBHOOK_SECRET", "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==")

from main import app  # noqa: E402

TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def generate_signature(payload: str, secret: str, timestamp: str, msg_id: str) -> str:
    """Build a Standard Webhooks v1 signature for the given payload."""
    signed_content = f"{msg_id}.{timestamp}.{payload}"
    secret_bytes = base64.b64decode(secret[len("whsec_"):])
    signature = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode(), hashlib.sha256).digest()
    ).decode()
    return f"v1,{signature}"


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("WEBHOOK_SECRET", TEST_SECRET)


def post_webhook(payload: str, msg_id: str, timestamp: str, signature: str):
    return client.post(
        "/webhooks/standard",
        content=payload,
        headers={
            "content-type": "application/json",
            "webhook-id": msg_id,
            "webhook-timestamp": timestamp,
            "webhook-signature": signature,
        },
    )


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_webhook():
    payload = json.dumps(
        {
            "type": "contact.created",
            "timestamp": "2025-01-15T10:00:00Z",
            "data": {"id": "ct_123", "email": "test@example.com"},
        }
    )
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_signature(payload, TEST_SECRET, timestamp, msg_id)

    response = post_webhook(payload, msg_id, timestamp, signature)
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "contact.created"}


def test_multiple_signatures():
    """Multiple space-delimited signatures (key rotation) — one valid, one not."""
    payload = json.dumps(
        {"type": "contact.updated", "timestamp": "2025-01-15T10:00:00Z", "data": {"id": "ct_123"}}
    )
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    valid = generate_signature(payload, TEST_SECRET, timestamp, msg_id)
    invalid = "v1,aW52YWxpZF9zaWduYXR1cmU="

    response = post_webhook(payload, msg_id, timestamp, f"{invalid} {valid}")
    assert response.status_code == 200


def test_missing_headers():
    payload = json.dumps({"type": "contact.created", "data": {}})
    response = client.post(
        "/webhooks/standard",
        content=payload,
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400
    assert "Missing required" in response.json()["detail"]


def test_invalid_signature():
    payload = json.dumps({"type": "contact.created", "data": {}})
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)

    response = post_webhook(payload, msg_id, timestamp, "v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    payload = json.dumps({"type": "contact.created", "data": {}})
    old_timestamp = str(int(time.time()) - 600)  # 10 min ago
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_signature(payload, TEST_SECRET, old_timestamp, msg_id)

    response = post_webhook(payload, msg_id, old_timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


@pytest.mark.parametrize(
    "event_type,extra_data",
    [
        ("contact.created", {"email": "test@example.com"}),
        ("contact.updated", {}),
        ("contact.deleted", {}),
        ("message.sent", {}),
        ("message.failed", {"error": "bounced"}),
    ],
)
def test_common_event_types(event_type, extra_data):
    payload = json.dumps(
        {
            "type": event_type,
            "timestamp": "2025-01-15T10:00:00Z",
            "data": {"id": "resource_123", **extra_data},
        }
    )
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_signature(payload, TEST_SECRET, timestamp, msg_id)

    response = post_webhook(payload, msg_id, timestamp, signature)
    assert response.status_code == 200
    assert response.json()["type"] == event_type


def test_unknown_event_type():
    payload = json.dumps(
        {
            "type": "unknown.event.type",
            "timestamp": "2025-01-15T10:00:00Z",
            "data": {"id": "resource_123"},
        }
    )
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_signature(payload, TEST_SECRET, timestamp, msg_id)

    response = post_webhook(payload, msg_id, timestamp, signature)
    assert response.status_code == 200
    assert response.json()["type"] == "unknown.event.type"
