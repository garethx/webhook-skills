import hmac
import hashlib
import base64
import json
import time
import secrets

import pytest
from fastapi.testclient import TestClient

from main import app

# Test signing secret. base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def generate_svix_signature(payload: str, secret: str, timestamp: str, msg_id: str) -> str:
    """Generate a valid Svix signature (the same algorithm the sender uses)."""
    signed_content = f"{msg_id}.{timestamp}.{payload}"
    key = base64.b64decode(secret.split("_")[1])
    signature = base64.b64encode(
        hmac.new(key, signed_content.encode(), hashlib.sha256).digest()
    ).decode()
    return f"v1,{signature}"


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("SVIX_WEBHOOK_SECRET", TEST_SECRET)


def svix_headers(msg_id: str, timestamp: str, signature: str) -> dict:
    return {
        "content-type": "application/json",
        "svix-id": msg_id,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
    }


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_webhook():
    payload = json.dumps({"type": "invoice.paid", "data": {"id": "in_123"}})
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_svix_signature(payload, TEST_SECRET, timestamp, msg_id)

    response = client.post(
        "/webhooks/svix", content=payload, headers=svix_headers(msg_id, timestamp, signature)
    )

    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "invoice.paid"}


def test_webhook_header_aliases():
    """Standard Webhooks senders may use webhook-* header names."""
    payload = json.dumps({"type": "user.created", "data": {"id": "user_123"}})
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_svix_signature(payload, TEST_SECRET, timestamp, msg_id)

    response = client.post(
        "/webhooks/svix",
        content=payload,
        headers={
            "content-type": "application/json",
            "webhook-id": msg_id,
            "webhook-timestamp": timestamp,
            "webhook-signature": signature,
        },
    )

    assert response.status_code == 200
    assert response.json()["type"] == "user.created"


def test_multiple_signatures():
    """Secret rotation: accept the message if any signature matches."""
    payload = json.dumps({"type": "user.updated", "data": {"id": "user_123"}})
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    valid = generate_svix_signature(payload, TEST_SECRET, timestamp, msg_id)
    invalid = "v1,aW52YWxpZF9zaWduYXR1cmU="

    response = client.post(
        "/webhooks/svix",
        content=payload,
        headers=svix_headers(msg_id, timestamp, f"{invalid} {valid}"),
    )

    assert response.status_code == 200


def test_missing_headers():
    payload = json.dumps({"type": "user.created", "data": {"id": "user_123"}})

    response = client.post(
        "/webhooks/svix", content=payload, headers={"content-type": "application/json"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    payload = json.dumps({"type": "user.created", "data": {"id": "user_123"}})
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)

    response = client.post(
        "/webhooks/svix",
        content=payload,
        headers=svix_headers(msg_id, timestamp, "v1,aW52YWxpZF9zaWduYXR1cmU="),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    payload = json.dumps({"type": "user.created", "data": {"id": "user_123"}})
    old_timestamp = str(int(time.time()) - 600)  # 10 minutes ago
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_svix_signature(payload, TEST_SECRET, old_timestamp, msg_id)

    response = client.post(
        "/webhooks/svix",
        content=payload,
        headers=svix_headers(msg_id, old_timestamp, signature),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


@pytest.mark.parametrize(
    "event_type", ["invoice.paid", "user.created", "user.updated", "message.sent"]
)
def test_common_event_types(event_type):
    payload = json.dumps({"type": event_type, "data": {"id": "resource_123"}})
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_svix_signature(payload, TEST_SECRET, timestamp, msg_id)

    response = client.post(
        "/webhooks/svix", content=payload, headers=svix_headers(msg_id, timestamp, signature)
    )

    assert response.status_code == 200
    assert response.json()["type"] == event_type


def test_unknown_event_type():
    payload = json.dumps({"type": "some.unknown.event", "data": {"id": "resource_123"}})
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_svix_signature(payload, TEST_SECRET, timestamp, msg_id)

    response = client.post(
        "/webhooks/svix", content=payload, headers=svix_headers(msg_id, timestamp, signature)
    )

    assert response.status_code == 200
    assert response.json()["type"] == "some.unknown.event"
