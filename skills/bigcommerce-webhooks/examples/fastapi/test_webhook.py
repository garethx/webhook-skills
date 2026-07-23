import base64
import json
import os
from datetime import datetime, timezone

# Set the client secret before importing the app. The handler base64-encodes it
# before handing it to the standardwebhooks library.
os.environ["BIGCOMMERCE_CLIENT_SECRET"] = "test_client_secret_value"

from fastapi.testclient import TestClient  # noqa: E402
from standardwebhooks.webhooks import Webhook  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

# Reconstruct the same signer the handler uses: base64-encoded client secret.
_encoded_secret = base64.b64encode(
    os.environ["BIGCOMMERCE_CLIENT_SECRET"].encode()
).decode()
wh = Webhook(_encoded_secret)


def signed_headers(payload: str, webhook_id: str = "msg_test_123", ts: int | None = None):
    if ts is None:
        ts = int(datetime.now(timezone.utc).timestamp())
    dt = datetime.fromtimestamp(ts, timezone.utc)
    signature = wh.sign(webhook_id, dt, payload)
    return {
        "content-type": "application/json",
        "webhook-id": webhook_id,
        "webhook-timestamp": str(ts),
        "webhook-signature": signature,
    }


def test_missing_signature_headers():
    response = client.post(
        "/webhooks/bigcommerce",
        content="{}",
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400
    assert response.text == "Invalid signature"


def test_invalid_signature():
    payload = json.dumps({"scope": "store/order/created", "data": {"type": "order", "id": 1}})
    response = client.post(
        "/webhooks/bigcommerce",
        content=payload,
        headers={
            "content-type": "application/json",
            "webhook-id": "msg_test_123",
            "webhook-timestamp": str(int(datetime.now(timezone.utc).timestamp())),
            "webhook-signature": "v1,not_a_real_signature",
        },
    )
    assert response.status_code == 400
    assert response.text == "Invalid signature"


def test_expired_timestamp():
    payload = json.dumps({"scope": "store/order/created", "data": {"type": "order", "id": 1}})
    old_ts = int(datetime.now(timezone.utc).timestamp()) - 600  # 10 min ago
    response = client.post(
        "/webhooks/bigcommerce",
        content=payload,
        headers=signed_headers(payload, ts=old_ts),
    )
    assert response.status_code == 400
    assert response.text == "Invalid signature"


def test_tampered_payload():
    original = json.dumps({"scope": "store/order/created", "data": {"type": "order", "id": 1}})
    headers = signed_headers(original)
    tampered = json.dumps({"scope": "store/order/created", "data": {"type": "order", "id": 999}})
    response = client.post("/webhooks/bigcommerce", content=tampered, headers=headers)
    assert response.status_code == 400
    assert response.text == "Invalid signature"


def test_valid_signature():
    payload = json.dumps(
        {
            "store_id": "1000",
            "producer": "stores/abc123",
            "scope": "store/order/statusUpdated",
            "data": {"type": "order", "id": 173331},
            "hash": "a1b2c3",
            "created_at": 1561479335,
        }
    )
    response = client.post(
        "/webhooks/bigcommerce",
        content=payload,
        headers=signed_headers(payload),
    )
    assert response.status_code == 200
    assert response.json() == {"received": True}


SCOPES = [
    "store/order/created",
    "store/order/updated",
    "store/order/statusUpdated",
    "store/product/created",
    "store/product/updated",
    "store/product/deleted",
    "store/product/inventory/updated",
    "store/customer/created",
    "store/cart/created",
    "store/cart/abandoned",
]


def test_all_scopes():
    for scope in SCOPES:
        payload = json.dumps({"scope": scope, "data": {"type": scope.split("/")[1], "id": 555}})
        response = client.post(
            "/webhooks/bigcommerce",
            content=payload,
            headers=signed_headers(payload),
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}


def test_unrecognized_scope():
    payload = json.dumps({"scope": "store/something/unknown", "data": {"type": "thing", "id": 1}})
    response = client.post(
        "/webhooks/bigcommerce",
        content=payload,
        headers=signed_headers(payload),
    )
    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
