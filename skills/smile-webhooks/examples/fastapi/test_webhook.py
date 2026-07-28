import hashlib
import hmac
import json
import os

# Set env before importing the app so module-level config picks it up.
os.environ["SMILE_WEBHOOK_SECRET"] = "test_webhook_secret"

from fastapi.testclient import TestClient

import main

SECRET = os.environ["SMILE_WEBHOOK_SECRET"]
PAYLOAD = json.dumps(
    {
        "id": "et-123abc456def789abc123def456abc78",
        "version": 1,
        "type": "ACCOUNT_CONNECTED",
        "createdAt": "2021-04-14T09:30:24Z",
        "data": {
            "userId": "tenantId-123abc456def789abc123def456abc78",
            "accountId": "a-123abc456def789abc123def456abc78",
            "loginName": "userLoginName",
            "providers": ["abccorp"],
        },
    }
)


def sign(body: str, secret: str = SECRET) -> str:
    """Generate a real Smile signature: HMAC-SHA512 hex over the raw body."""
    return hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha512).hexdigest()


client = TestClient(main.app)


def test_accepts_valid_signature():
    res = client.post(
        "/webhooks/smile",
        headers={"Smile-Signature": sign(PAYLOAD), "Content-Type": "application/json"},
        content=PAYLOAD,
    )
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_rejects_missing_signature():
    res = client.post(
        "/webhooks/smile",
        headers={"Content-Type": "application/json"},
        content=PAYLOAD,
    )
    assert res.status_code == 400


def test_rejects_invalid_signature():
    res = client.post(
        "/webhooks/smile",
        headers={"Smile-Signature": "deadbeef", "Content-Type": "application/json"},
        content=PAYLOAD,
    )
    assert res.status_code == 400


def test_rejects_wrong_secret():
    res = client.post(
        "/webhooks/smile",
        headers={
            "Smile-Signature": sign(PAYLOAD, "wrong_secret"),
            "Content-Type": "application/json",
        },
        content=PAYLOAD,
    )
    assert res.status_code == 400


def test_rejects_tampered_body():
    signature = sign(PAYLOAD)  # signature for the original body
    tampered = PAYLOAD.replace("ACCOUNT_CONNECTED", "RECORD_COMPLETED")
    res = client.post(
        "/webhooks/smile",
        headers={"Smile-Signature": signature, "Content-Type": "application/json"},
        content=tampered,
    )
    assert res.status_code == 400


def test_rejects_invalid_json_with_valid_signature():
    body = "{not json"
    res = client.post(
        "/webhooks/smile",
        headers={"Smile-Signature": sign(body), "Content-Type": "application/json"},
        content=body,
    )
    assert res.status_code == 400
