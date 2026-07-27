import os
import hmac
import hashlib

# Realistic test secret (any string works; Paymob's is an opaque key)
os.environ["PAYMOB_HMAC_SECRET"] = "test_hmac_secret"

from fastapi.testclient import TestClient
from main import app, build_signed_string, transaction_state

client = TestClient(app)

SECRET = "test_hmac_secret"


def make_obj(**overrides):
    obj = {
        "id": 123456789,
        "amount_cents": 10000,
        "created_at": "2026-07-27T10:15:30.123456",
        "currency": "EGP",
        "error_occured": False,
        "has_parent_transaction": False,
        "integration_id": 987654,
        "is_3d_secure": True,
        "is_auth": False,
        "is_capture": False,
        "is_refunded": False,
        "is_standalone_payment": True,
        "is_voided": False,
        "pending": False,
        "success": True,
        "owner": 543210,
        "order": {"id": 222333444},
        "source_data": {"pan": "2346", "sub_type": "MasterCard", "type": "card"},
    }
    obj.update(overrides)
    return obj


def sign(obj, secret=SECRET):
    """Generate a valid HMAC exactly as Paymob does: SHA512 hex over the ordered fields."""
    return hmac.new(
        secret.encode("utf-8"),
        build_signed_string(obj).encode("utf-8"),
        hashlib.sha512,
    ).hexdigest()


def post(obj, hmac_value):
    return client.post(
        "/webhooks/paymob",
        params={"hmac": hmac_value} if hmac_value is not None else None,
        json={"type": "TRANSACTION", "obj": obj},
    )


def test_accepts_valid_hmac():
    obj = make_obj()
    res = post(obj, sign(obj))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_rejects_invalid_hmac():
    obj = make_obj()
    res = post(obj, "deadbeef")
    assert res.status_code == 400


def test_rejects_missing_hmac():
    obj = make_obj()
    res = post(obj, None)
    assert res.status_code == 400


def test_rejects_tampered_payload():
    obj = make_obj()
    valid = sign(obj)  # sign the original
    tampered = make_obj(amount_cents=1)  # attacker lowers the amount
    res = post(tampered, valid)
    assert res.status_code == 400


def test_rejects_non_transaction_payload():
    res = client.post(
        "/webhooks/paymob",
        params={"hmac": "abc"},
        json={"type": "SOMETHING_ELSE"},
    )
    assert res.status_code == 400


def test_uses_sha512_128_char_hex():
    assert len(sign(make_obj())) == 128


def test_transaction_state():
    assert transaction_state(make_obj()) == "succeeded"
    assert transaction_state(make_obj(success=False, error_occured=True)) == "failed"
    assert transaction_state(make_obj(pending=True)) == "pending"
    assert transaction_state(make_obj(is_auth=True, is_capture=False)) == "authorized"
    assert transaction_state(make_obj(is_refunded=True)) == "refunded"
    assert transaction_state(make_obj(is_voided=True)) == "voided"
