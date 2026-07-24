import base64
import importlib
import json
import os
from urllib.parse import quote

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

CLIENT_ID = "SANDBOX_5YC47N2ZQHJ004124"
WEBHOOK_PATH = "/webhooks/alipay"

# Two RSA key pairs: one stands in for Antom (signs inbound notifications), one
# for the merchant (signs the ack response). SHA256withRSA is the exact
# algorithm the real provider uses.
_alipay_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_merchant_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _pem_private(key):
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


def _pem_public(key):
    return key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")


# Env must be set BEFORE importing the app (it reads env at module load).
os.environ["ALIPAY_CLIENT_ID"] = CLIENT_ID
os.environ["ALIPAY_PUBLIC_KEY"] = _pem_public(_alipay_key)
os.environ["ALIPAY_MERCHANT_PRIVATE_KEY"] = _pem_private(_merchant_key)
os.environ["ALIPAY_KEY_VERSION"] = "1"

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

importlib.reload(main)
client = TestClient(main.app)


def sign_inbound(raw_body: str, client_id=CLIENT_ID, request_time="2026-07-24T10:00:00Z", url_encode=False):
    content = f"POST {WEBHOOK_PATH}\n{client_id}.{request_time}.{raw_body}".encode("utf-8")
    signature = _alipay_key.sign(content, padding.PKCS1v15(), hashes.SHA256())
    sig_b64url = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    if url_encode:
        sig_b64url = quote(sig_b64url, safe="")
    return {
        "Client-Id": client_id,
        "Request-Time": request_time,
        "Signature": f"algorithm=RSA256,keyVersion=1,signature={sig_b64url}",
        "Content-Type": "application/json",
    }


def payment_payload(**overrides):
    payload = {
        "notifyType": "PAYMENT_RESULT",
        "result": {"resultCode": "SUCCESS", "resultStatus": "S", "resultMessage": "success"},
        "paymentRequestId": "pay_20260724_0001",
        "paymentId": "20260724194010800100188420201535803",
        "paymentAmount": {"value": "8000", "currency": "USD"},
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_missing_headers_returns_400():
    res = client.post(WEBHOOK_PATH, content=payment_payload(), headers={"Content-Type": "application/json"})
    assert res.status_code == 400


def test_invalid_signature_returns_401():
    payload = payment_payload()
    headers = sign_inbound(payload)
    headers["Signature"] = "algorithm=RSA256,keyVersion=1,signature=bm90LWEtc2ln"
    res = client.post(WEBHOOK_PATH, content=payload, headers=headers)
    assert res.status_code == 401


def test_tampered_body_returns_401():
    original = payment_payload(paymentAmount={"value": "8000", "currency": "USD"})
    headers = sign_inbound(original)
    tampered = payment_payload(paymentAmount={"value": "999999", "currency": "USD"})
    res = client.post(WEBHOOK_PATH, content=tampered, headers=headers)
    assert res.status_code == 401


def test_valid_signature_returns_signed_ack():
    payload = payment_payload()
    headers = sign_inbound(payload)
    res = client.post(WEBHOOK_PATH, content=payload, headers=headers)

    assert res.status_code == 200
    assert res.json() == {
        "result": {"resultCode": "SUCCESS", "resultStatus": "S", "resultMessage": "Success"}
    }
    assert res.headers.get("client-id") == CLIENT_ID
    assert res.headers.get("response-time")
    assert res.headers.get("signature", "").startswith("algorithm=RSA256,keyVersion=1,signature=")


def test_ack_response_is_verifiable_with_merchant_key():
    payload = payment_payload()
    headers = sign_inbound(payload)
    res = client.post(WEBHOOK_PATH, content=payload, headers=headers)

    response_time = res.headers["response-time"]
    sig_value = res.headers["signature"].split("signature=", 1)[1]
    content = f"POST {WEBHOOK_PATH}\n{CLIENT_ID}.{response_time}.{res.text}".encode("utf-8")

    normalized = sig_value.replace("-", "+").replace("_", "/")
    normalized += "=" * (-len(normalized) % 4)
    signature = base64.b64decode(normalized)

    # Should not raise — the ack is signed with the merchant private key.
    _merchant_key.public_key().verify(signature, content, padding.PKCS1v15(), hashes.SHA256())


def test_percent_encoded_signature_accepted():
    payload = payment_payload()
    headers = sign_inbound(payload, url_encode=True)
    res = client.post(WEBHOOK_PATH, content=payload, headers=headers)
    assert res.status_code == 200


import pytest  # noqa: E402


@pytest.mark.parametrize(
    "notify_type,extra",
    [
        ("PAYMENT_RESULT", {"paymentRequestId": "pay_1"}),
        ("CAPTURE_RESULT", {"captureRequestId": "cap_1", "captureId": "c_1"}),
        ("REFUND_RESULT", {"refundRequestId": "ref_1", "refundId": "r_1"}),
        ("AUTHORIZATION_RESULT", {"authorizationRequestId": "auth_1"}),
        ("DISPUTE_CREATED", {"disputeId": "dsp_1"}),
        ("DISPUTE_JUDGED", {"disputeId": "dsp_1"}),
        ("SOMETHING_ELSE", {}),
    ],
)
def test_handles_notify_types(notify_type, extra):
    body = {
        "notifyType": notify_type,
        "result": {"resultCode": "SUCCESS", "resultStatus": "S", "resultMessage": "success"},
    }
    body.update(extra)
    payload = json.dumps(body)
    headers = sign_inbound(payload)
    res = client.post(WEBHOOK_PATH, content=payload, headers=headers)
    assert res.status_code == 200


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
