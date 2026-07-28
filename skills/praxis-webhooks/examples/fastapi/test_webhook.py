import hashlib
import json
import os

# Set env before importing the app so module-level config picks it up.
os.environ["PRAXIS_MERCHANT_SECRET"] = "test_merchant_secret"

from fastapi.testclient import TestClient

import main

SECRET = os.environ["PRAXIS_MERCHANT_SECRET"]

# Mirror the provider's algorithm to generate real signatures in tests:
# SHA-384 over the concatenated field values + Merchant Secret (NOT an HMAC).
PAYMENT_FIELDS = [
    "merchant_id", "application_key", "timestamp", "customer.customer_token",
    "session.order_id", "transaction.tid", "transaction.currency", "transaction.amount",
    "transaction.conversion_rate", "transaction.processed_currency", "transaction.processed_amount",
]
SUBSCRIPTION_FIELDS = [
    "event", "merchant_id", "application_key", "cid", "plan_id",
    "subscription_id", "subscription_status", "timestamp",
]


def _at(obj, path):
    cur = obj
    for key in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def sign(body, secret):
    fields = SUBSCRIPTION_FIELDS if body.get("event") else PAYMENT_FIELDS
    data = "".join("" if _at(body, p) is None else str(_at(body, p)) for p in fields)
    return hashlib.sha384((data + secret).encode("utf-8")).hexdigest()


# Amounts are STRINGS, exactly as Praxis sends them.
PAYMENT = {
    "merchant_id": "123456",
    "application_key": "app_key_abc",
    "timestamp": 1700000000,
    "customer": {"customer_token": "cust_abc"},
    "session": {"order_id": "order_789"},
    "transaction": {
        "tid": "tx_555",
        "currency": "USD",
        "amount": "10.00",
        "conversion_rate": "1.00",
        "processed_currency": "USD",
        "processed_amount": "10.00",
        "transaction_status": "approved",
    },
}

SUBSCRIPTION = {
    "event": "PaymentSucceeded",
    "merchant_id": "123456",
    "application_key": "app_key_abc",
    "cid": "cust_abc",
    "plan_id": "plan_1",
    "subscription_id": "sub_1",
    "subscription_status": "active",
    "timestamp": 1700000000,
}

client = TestClient(main.app)


def test_accepts_valid_payment_and_returns_signed_ack():
    payload = json.dumps(PAYMENT)
    res = client.post(
        "/webhooks/praxis",
        headers={"gt-authentication": sign(PAYMENT, SECRET), "Content-Type": "application/json"},
        content=payload,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == 0
    expected_ack = hashlib.sha384(
        f"0{body['timestamp']}{SECRET}".encode("utf-8")
    ).hexdigest()
    assert res.headers["external-request-signature"] == expected_ack


def test_accepts_valid_subscription():
    res = client.post(
        "/webhooks/praxis",
        headers={"gt-authentication": sign(SUBSCRIPTION, SECRET), "Content-Type": "application/json"},
        content=json.dumps(SUBSCRIPTION),
    )
    assert res.status_code == 200
    assert res.json()["status"] == 0


def test_rejects_invalid_signature():
    res = client.post(
        "/webhooks/praxis",
        headers={"gt-authentication": "a" * 96, "Content-Type": "application/json"},
        content=json.dumps(PAYMENT),
    )
    assert res.status_code == 400


def test_rejects_wrong_secret():
    res = client.post(
        "/webhooks/praxis",
        headers={"gt-authentication": sign(PAYMENT, "wrong_secret"), "Content-Type": "application/json"},
        content=json.dumps(PAYMENT),
    )
    assert res.status_code == 400


def test_rejects_tampered_amount():
    sig = sign(PAYMENT, SECRET)
    tampered = json.loads(json.dumps(PAYMENT))
    tampered["transaction"]["amount"] = "9999.00"
    res = client.post(
        "/webhooks/praxis",
        headers={"gt-authentication": sig, "Content-Type": "application/json"},
        content=json.dumps(tampered),
    )
    assert res.status_code == 400


def test_rejects_missing_signature_header():
    res = client.post(
        "/webhooks/praxis",
        headers={"Content-Type": "application/json"},
        content=json.dumps(PAYMENT),
    )
    assert res.status_code == 400


def test_rejects_invalid_json():
    res = client.post(
        "/webhooks/praxis",
        headers={"gt-authentication": "a" * 96, "Content-Type": "application/json"},
        content="{not json",
    )
    assert res.status_code == 400
