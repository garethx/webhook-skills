import hashlib
import hmac
import json
import os

# Set env before importing the app so module-level config picks it up.
os.environ["GREENDOT_WEBHOOK_TOKEN_SECRET"] = "test_token_secret_at_least_32_bytes_long"
os.environ["GREENDOT_WEBHOOK_SCOPE"] = "post:webhook"
os.environ.pop("GREENDOT_SIGNING_KEY", None)

import importlib

import jwt
import pytest
from fastapi.testclient import TestClient

import main

REQUEST_ID = "req-abc-123"
PAYLOAD = json.dumps(
    {
        "eventType": "transaction",
        "programCode": "MYPROGRAM",
        "eventId": "evt-1",
        "data": {"accountId": "acct_123", "amount": 42.5},
    }
)


def make_token(scope="post:webhook"):
    return jwt.encode(
        {"scope": scope}, os.environ["GREENDOT_WEBHOOK_TOKEN_SECRET"], algorithm="HS256"
    )


def hmac_hex(raw_body: str, key: str) -> str:
    return hmac.new(key.encode(), raw_body.encode(), hashlib.sha256).hexdigest()


def load_client(signing_key=None):
    """Reload the app so GREENDOT_SIGNING_KEY changes take effect."""
    if signing_key is None:
        os.environ.pop("GREENDOT_SIGNING_KEY", None)
    else:
        os.environ["GREENDOT_SIGNING_KEY"] = signing_key
    importlib.reload(main)
    return TestClient(main.app)


def teardown_function():
    os.environ.pop("GREENDOT_SIGNING_KEY", None)
    importlib.reload(main)


def test_accepts_valid_token_and_echoes_request_id():
    client = load_client()
    res = client.post(
        "/webhooks/greendot",
        headers={
            "Authorization": f"Bearer {make_token()}",
            "x-GD-RequestId": REQUEST_ID,
            "Content-Type": "application/json",
        },
        content=PAYLOAD,
    )
    assert res.status_code == 200
    assert res.headers["x-GD-RequestId"] == REQUEST_ID
    detail = res.json()["responseDetails"][0]
    assert detail == {"code": 0, "subCode": 0, "description": REQUEST_ID}


def test_rejects_missing_token():
    client = load_client()
    res = client.post(
        "/webhooks/greendot",
        headers={"x-GD-RequestId": REQUEST_ID, "Content-Type": "application/json"},
        content=PAYLOAD,
    )
    assert res.status_code == 401


def test_rejects_wrong_secret():
    client = load_client()
    bad = jwt.encode({"scope": "post:webhook"}, "wrong_secret", algorithm="HS256")
    res = client.post(
        "/webhooks/greendot",
        headers={"Authorization": f"Bearer {bad}", "Content-Type": "application/json"},
        content=PAYLOAD,
    )
    assert res.status_code == 401


def test_rejects_missing_scope():
    client = load_client()
    res = client.post(
        "/webhooks/greendot",
        headers={
            "Authorization": f"Bearer {make_token(scope='read:account')}",
            "Content-Type": "application/json",
        },
        content=PAYLOAD,
    )
    assert res.status_code == 401


def test_verifies_signature_when_key_configured():
    client = load_client(signing_key="program_signing_key")
    signature = hmac_hex(PAYLOAD, "program_signing_key")
    res = client.post(
        "/webhooks/greendot",
        headers={
            "Authorization": f"Bearer {make_token()}",
            "x-GD-RequestId": REQUEST_ID,
            "x-gd-signature": signature,
            "Content-Type": "application/json",
        },
        content=PAYLOAD,
    )
    assert res.status_code == 200


def test_rejects_invalid_signature_when_key_configured():
    client = load_client(signing_key="program_signing_key")
    res = client.post(
        "/webhooks/greendot",
        headers={
            "Authorization": f"Bearer {make_token()}",
            "x-gd-signature": "deadbeef",
            "Content-Type": "application/json",
        },
        content=PAYLOAD,
    )
    assert res.status_code == 400


def test_rejects_invalid_json_after_auth():
    client = load_client()
    res = client.post(
        "/webhooks/greendot",
        headers={
            "Authorization": f"Bearer {make_token()}",
            "Content-Type": "application/json",
        },
        content="{not json",
    )
    assert res.status_code == 400
