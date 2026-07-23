import os
import json
import hmac
import base64
import hashlib

PUBLIC_KEY = "wh_pk_test_public_key"
SECRET_KEY = "wh_sk_test_secret_key"

# Configure env before importing the app
os.environ["SOLIDGATE_WEBHOOK_PUBLIC_KEY"] = PUBLIC_KEY
os.environ["SOLIDGATE_WEBHOOK_SECRET_KEY"] = SECRET_KEY

from fastapi.testclient import TestClient  # noqa: E402
from main import app, verify_solidgate_signature  # noqa: E402

client = TestClient(app)


def generate_signature(body: str, public_key: str, secret_key: str) -> str:
    """base64( hex( HMAC-SHA512(secret, pub + body + pub) ) )"""
    message = public_key.encode("utf-8") + body.encode("utf-8") + public_key.encode("utf-8")
    hex_digest = hmac.new(secret_key.encode("utf-8"), message, hashlib.sha512).hexdigest()
    return base64.b64encode(hex_digest.encode("utf-8")).decode("utf-8")


# --- Unit tests for the verification function ---

def test_validates_correct_signature():
    body = json.dumps({"order": {"order_id": "ord_1", "status": "approved"}})
    signature = generate_signature(body, PUBLIC_KEY, SECRET_KEY)
    assert verify_solidgate_signature(body.encode(), signature, PUBLIC_KEY, SECRET_KEY)


def test_rejects_invalid_signature():
    body = json.dumps({"order": {"order_id": "ord_1"}})
    assert not verify_solidgate_signature(body.encode(), "invalid", PUBLIC_KEY, SECRET_KEY)


def test_rejects_tampered_body():
    body = json.dumps({"order": {"order_id": "ord_1", "amount": 1000}})
    signature = generate_signature(body, PUBLIC_KEY, SECRET_KEY)
    tampered = json.dumps({"order": {"order_id": "ord_1", "amount": 9999}})
    assert not verify_solidgate_signature(tampered.encode(), signature, PUBLIC_KEY, SECRET_KEY)


def test_rejects_wrong_secret():
    body = json.dumps({"order": {"order_id": "ord_1"}})
    signature = generate_signature(body, PUBLIC_KEY, SECRET_KEY)
    assert not verify_solidgate_signature(body.encode(), signature, PUBLIC_KEY, "wh_sk_wrong")


def test_double_encode_produces_hex_string():
    body = '{"test":true}'
    signature = generate_signature(body, PUBLIC_KEY, SECRET_KEY)
    decoded = base64.b64decode(signature).decode("utf-8")
    # SHA-512 hex digest is 128 lowercase hex chars
    assert len(decoded) == 128
    assert all(c in "0123456789abcdef" for c in decoded)


# --- Integration tests for the endpoint ---

def test_endpoint_accepts_valid_webhook():
    body = json.dumps({"order": {"order_id": "ord_42", "status": "approved"}})
    signature = generate_signature(body, PUBLIC_KEY, SECRET_KEY)
    res = client.post(
        "/webhooks/solidgate",
        content=body,
        headers={
            "content-type": "application/json",
            "merchant": PUBLIC_KEY,
            "signature": signature,
            "solidgate-event-type": "card_gate.order.updated",
            "solidgate-event-id": "evt_123",
        },
    )
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_endpoint_rejects_invalid_signature():
    body = json.dumps({"order": {"order_id": "ord_42"}})
    res = client.post(
        "/webhooks/solidgate",
        content=body,
        headers={
            "content-type": "application/json",
            "merchant": PUBLIC_KEY,
            "signature": "invalid",
            "solidgate-event-type": "card_gate.order.updated",
        },
    )
    assert res.status_code == 400


def test_endpoint_rejects_missing_signature():
    body = json.dumps({"order": {"order_id": "ord_42"}})
    res = client.post(
        "/webhooks/solidgate",
        content=body,
        headers={"content-type": "application/json", "merchant": PUBLIC_KEY},
    )
    assert res.status_code == 400


def test_endpoint_rejects_unexpected_merchant():
    body = json.dumps({"order": {"order_id": "ord_42"}})
    signature = generate_signature(body, PUBLIC_KEY, SECRET_KEY)
    res = client.post(
        "/webhooks/solidgate",
        content=body,
        headers={
            "content-type": "application/json",
            "merchant": "wh_pk_someone_else",
            "signature": signature,
            "solidgate-event-type": "card_gate.order.updated",
        },
    )
    assert res.status_code == 400


def test_endpoint_handles_subscription_event():
    body = json.dumps({"subscription": {"id": "sub_1", "status": "active"}})
    signature = generate_signature(body, PUBLIC_KEY, SECRET_KEY)
    res = client.post(
        "/webhooks/solidgate",
        content=body,
        headers={
            "content-type": "application/json",
            "merchant": PUBLIC_KEY,
            "signature": signature,
            "solidgate-event-type": "subscription.updated.v2",
            "solidgate-event-id": "evt_sub_1",
        },
    )
    assert res.status_code == 200
