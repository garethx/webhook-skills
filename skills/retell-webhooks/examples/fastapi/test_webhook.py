import os
import json
import time
import hmac
import hashlib

# Set test environment variables BEFORE importing the app
os.environ["RETELL_API_KEY"] = "test_retell_api_key"

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

API_KEY = os.environ["RETELL_API_KEY"]


def sign_body(body: str, api_key: str, timestamp: int | None = None) -> str:
    """
    Build a Retell-format signature header: "v={ms_timestamp},d={hex_digest}"
    over (raw body + timestamp), HMAC-SHA256 with the API key as the secret.
    Mirrors the algorithm in the Retell SDK's client.verify.
    """
    ts = timestamp if timestamp is not None else int(time.time() * 1000)
    digest = hmac.new(
        api_key.encode(),
        (body + str(ts)).encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"v={ts},d={digest}"


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_webhook_signature():
    payload = json.dumps({"event": "call_ended", "call": {"call_id": "call_abc123"}})
    signature = sign_body(payload, API_KEY)

    response = client.post(
        "/webhooks/retell",
        content=payload,
        headers={"X-Retell-Signature": signature, "Content-Type": "application/json"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_invalid_signature():
    payload = json.dumps({"event": "call_ended", "call": {"call_id": "call_abc123"}})

    response = client.post(
        "/webhooks/retell",
        content=payload,
        headers={
            "X-Retell-Signature": f"v={int(time.time() * 1000)},d=deadbeef",
            "Content-Type": "application/json",
        },
    )

    assert response.status_code == 401
    assert "Invalid signature" in response.json()["detail"]


def test_missing_signature_header():
    payload = json.dumps({"event": "call_ended", "call": {"call_id": "call_abc123"}})

    response = client.post(
        "/webhooks/retell",
        content=payload,
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 400
    assert "Missing signature header" in response.json()["detail"]


def test_wrong_key_signature():
    payload = json.dumps({"event": "call_ended", "call": {"call_id": "call_abc123"}})
    signature = sign_body(payload, "wrong_key")

    response = client.post(
        "/webhooks/retell",
        content=payload,
        headers={"X-Retell-Signature": signature, "Content-Type": "application/json"},
    )

    assert response.status_code == 401


def test_expired_timestamp():
    payload = json.dumps({"event": "call_ended", "call": {"call_id": "call_abc123"}})
    # 6 minutes ago, in milliseconds — outside the 5-minute window
    old_timestamp = int(time.time() * 1000) - 6 * 60 * 1000
    signature = sign_body(payload, API_KEY, old_timestamp)

    response = client.post(
        "/webhooks/retell",
        content=payload,
        headers={"X-Retell-Signature": signature, "Content-Type": "application/json"},
    )

    assert response.status_code == 401


def test_all_event_types():
    events = [
        ("call_started", "call"),
        ("call_ended", "call"),
        ("call_analyzed", "call"),
        ("transcript_updated", "call"),
        ("transfer_started", "call"),
        ("transfer_bridged", "call"),
        ("transfer_cancelled", "call"),
        ("transfer_ended", "call"),
        ("chat_started", "chat"),
        ("chat_ended", "chat"),
        ("chat_analyzed", "chat"),
    ]

    for event, object_key in events:
        body = {"event": event, object_key: {f"{object_key}_id": f"{object_key}_{event}"}}
        payload = json.dumps(body)
        signature = sign_body(payload, API_KEY)

        response = client.post(
            "/webhooks/retell",
            content=payload,
            headers={"X-Retell-Signature": signature, "Content-Type": "application/json"},
        )

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
