import json
import hmac
import hashlib
import base64
import time
import secrets

import pytest
from fastapi.testclient import TestClient

from main import app

# Test webhook secret (whsec_ + base64-encoded key)
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def generate_signature(payload: str, secret: str, timestamp: str, webhook_id: str) -> str:
    """Generate a valid ShipBob (Standard Webhooks) signature."""
    signed_content = f"{webhook_id}.{timestamp}.{payload}"
    secret_bytes = base64.b64decode(secret.split("_", 1)[1])
    signature = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode(), hashlib.sha256).digest()
    ).decode()
    return f"v1,{signature}"


def build_headers(topic, webhook_id, timestamp, signature):
    return {
        "content-type": "application/json",
        "webhook-id": webhook_id,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
        "x-webhook-topic": topic,
    }


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("SHIPBOB_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_webhook():
    payload = json.dumps({"id": "shipment_123", "order_id": 456, "status": "Completed"})
    timestamp = str(int(time.time()))
    webhook_id = "msg_" + secrets.token_hex(16)
    signature = generate_signature(payload, TEST_SECRET, timestamp, webhook_id)

    response = client.post(
        "/webhooks/shipbob",
        content=payload,
        headers=build_headers("order.shipped", webhook_id, timestamp, signature),
    )

    assert response.status_code == 200
    assert response.json() == {"success": True, "topic": "order.shipped"}


def test_multiple_signatures():
    payload = json.dumps({"id": "shipment_123", "status": "Delivered"})
    timestamp = str(int(time.time()))
    webhook_id = "msg_" + secrets.token_hex(16)
    valid_signature = generate_signature(payload, TEST_SECRET, timestamp, webhook_id)
    invalid_signature = "v1,aW52YWxpZF9zaWduYXR1cmU="
    multi_signature = f"{invalid_signature} {valid_signature}"

    response = client.post(
        "/webhooks/shipbob",
        content=payload,
        headers=build_headers(
            "order.shipment.delivered", webhook_id, timestamp, multi_signature
        ),
    )

    assert response.status_code == 200
    assert response.json() == {"success": True, "topic": "order.shipment.delivered"}


def test_missing_headers():
    payload = json.dumps({"id": "shipment_123"})

    response = client.post(
        "/webhooks/shipbob",
        content=payload,
        headers={"content-type": "application/json", "x-webhook-topic": "order.shipped"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    payload = json.dumps({"id": "shipment_123"})
    timestamp = str(int(time.time()))
    webhook_id = "msg_" + secrets.token_hex(16)

    response = client.post(
        "/webhooks/shipbob",
        content=payload,
        headers=build_headers(
            "order.shipped", webhook_id, timestamp, "v1,aW52YWxpZF9zaWduYXR1cmU="
        ),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    payload = json.dumps({"id": "shipment_123"})
    old_timestamp = str(int(time.time()) - 600)
    webhook_id = "msg_" + secrets.token_hex(16)
    signature = generate_signature(payload, TEST_SECRET, old_timestamp, webhook_id)

    response = client.post(
        "/webhooks/shipbob",
        content=payload,
        headers=build_headers("order.shipped", webhook_id, old_timestamp, signature),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


@pytest.mark.parametrize(
    "topic",
    [
        "order.shipped",
        "order.shipment.delivered",
        "order.shipment.tracking.updated",
        "order.shipment.exception",
        "return.created",
        "wro.created",
        "billing.charge.created",
    ],
)
def test_common_topics(topic):
    payload = json.dumps({"id": "resource_123", "topic": topic})
    timestamp = str(int(time.time()))
    webhook_id = "msg_" + secrets.token_hex(16)
    signature = generate_signature(payload, TEST_SECRET, timestamp, webhook_id)

    response = client.post(
        "/webhooks/shipbob",
        content=payload,
        headers=build_headers(topic, webhook_id, timestamp, signature),
    )

    assert response.status_code == 200
    assert response.json()["topic"] == topic


def test_unknown_topic():
    payload = json.dumps({"id": "resource_123"})
    timestamp = str(int(time.time()))
    webhook_id = "msg_" + secrets.token_hex(16)
    signature = generate_signature(payload, TEST_SECRET, timestamp, webhook_id)

    response = client.post(
        "/webhooks/shipbob",
        content=payload,
        headers=build_headers("some.unhandled.topic", webhook_id, timestamp, signature),
    )

    assert response.status_code == 200
    assert response.json()["topic"] == "some.unhandled.topic"
