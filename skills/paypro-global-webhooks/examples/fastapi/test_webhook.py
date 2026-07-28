import hashlib
import os

# Set env before importing the app so the endpoint reads matching keys.
os.environ["PAYPRO_VALIDATION_KEY"] = "qwerty"
os.environ["PAYPRO_SECRET_KEY"] = "wErt6HmQ"
os.environ.pop("PAYPRO_ENFORCE_IP", None)

from fastapi.testclient import TestClient

import main

VALIDATION_KEY = "qwerty"
SECRET_KEY = "wErt6HmQ"

# A representative live-order IPN payload (form fields).
BASE_FIELDS = {
    "IPN_TYPE_NAME": "OrderCharged",
    "ORDER_ID": "12345",
    "ORDER_STATUS": "Processed",
    "ORDER_TOTAL_AMOUNT": "9.99",
    "CUSTOMER_EMAIL": "test@payproglobal.com",
    "TEST_MODE": "0",
}

client = TestClient(main.app)


def sign_signature(f, validation_key):
    """Generate the SIGNATURE exactly as PayPro Global does (SHA256, hex)."""
    base = (
        f"{f['ORDER_ID']}{f['ORDER_STATUS']}{f['ORDER_TOTAL_AMOUNT']}"
        f"{f['CUSTOMER_EMAIL']}{validation_key}{f['TEST_MODE']}{f['IPN_TYPE_NAME']}"
    )
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def sign_hash(f, secret_key):
    """Generate the HASH exactly as PayPro Global does (MD5, hex)."""
    base = "1" if str(f["TEST_MODE"]) == "1" else f"{f['ORDER_ID']}{secret_key}"
    return hashlib.md5(base.encode("utf-8")).hexdigest()


def signed_fields(**overrides):
    """Build a fully-signed set of form fields."""
    f = {**BASE_FIELDS, **overrides}
    f["SIGNATURE"] = sign_signature(f, VALIDATION_KEY)
    f["HASH"] = sign_hash(f, SECRET_KEY)
    return f


# ---- Unit tests: verify_signature -------------------------------------------


def test_signature_matches_documented_example():
    # sha256("12345Processed9.99test@payproglobal.comqwerty1OrderCharged")
    f = {**BASE_FIELDS, "TEST_MODE": "1"}
    f["SIGNATURE"] = sign_signature(f, VALIDATION_KEY)
    assert main.verify_signature(f, VALIDATION_KEY) is True


def test_signature_valid():
    assert main.verify_signature(signed_fields(), VALIDATION_KEY) is True


def test_signature_tampered_field():
    f = signed_fields()
    f["ORDER_TOTAL_AMOUNT"] = "999.99"
    assert main.verify_signature(f, VALIDATION_KEY) is False


def test_signature_wrong_key():
    assert main.verify_signature(signed_fields(), "wrong_key") is False


def test_signature_missing():
    assert main.verify_signature({**BASE_FIELDS}, VALIDATION_KEY) is False


# ---- Unit tests: verify_hash ------------------------------------------------


def test_hash_valid_live_order():
    assert main.verify_hash(signed_fields(), SECRET_KEY) is True


def test_hash_valid_test_order():
    f = signed_fields(TEST_MODE="1", ORDER_TOTAL_AMOUNT="0")
    assert main.verify_hash(f, SECRET_KEY) is True


def test_hash_matches_documented_example():
    # MD5("456346wErt6HmQ") = cdcca12c15a93df32818e463af053fbc
    f = {"ORDER_ID": "456346", "TEST_MODE": "0", "HASH": "cdcca12c15a93df32818e463af053fbc"}
    assert main.verify_hash(f, "wErt6HmQ") is True


def test_hash_wrong_key():
    assert main.verify_hash(signed_fields(), "wrong_secret") is False


# ---- Integration tests: POST /webhooks/paypro-global ------------------------


def test_post_valid_live_order():
    res = client.post("/webhooks/paypro-global", data=signed_fields())
    assert res.status_code == 200
    assert res.text == "OK"


def test_post_valid_test_order():
    res = client.post(
        "/webhooks/paypro-global",
        data=signed_fields(TEST_MODE="1", ORDER_TOTAL_AMOUNT="0"),
    )
    assert res.status_code == 200


def test_post_invalid_signature():
    f = signed_fields()
    f["SIGNATURE"] = "deadbeef"
    res = client.post("/webhooks/paypro-global", data=f)
    assert res.status_code == 400


def test_post_invalid_hash():
    f = signed_fields()
    f["HASH"] = "deadbeef"
    res = client.post("/webhooks/paypro-global", data=f)
    assert res.status_code == 400


def test_post_missing_verification_fields():
    res = client.post("/webhooks/paypro-global", data={**BASE_FIELDS})
    assert res.status_code == 400


def test_post_subscription_events():
    for evt in ["SubscriptionChargeSucceed", "SubscriptionRenewed", "SubscriptionTerminated"]:
        res = client.post("/webhooks/paypro-global", data=signed_fields(IPN_TYPE_NAME=evt))
        assert res.status_code == 200
