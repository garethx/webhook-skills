import base64
import json
import os
import time

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# A 32-character APIv3 key (AES-256 needs 32 bytes).
API_V3_KEY = "abcdefghijklmnopqrstuvwxyz012345"
SERIAL = "PLATFORM_CERT_SERIAL_123"
# A second serial, as published ~24h ahead of a certificate rotation.
ROTATED_SERIAL = "PLATFORM_CERT_SERIAL_456"


def _generate_key_pair():
    """Generate an RSA keypair to stand in for a WeChat Pay platform key."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return private_key, public_key_pem


_private_key, _public_key_pem = _generate_key_pair()
_rotated_private_key, _rotated_public_key_pem = _generate_key_pair()

# Set environment before importing the app.
os.environ["WECHAT_PAY_PUBLIC_KEY"] = _public_key_pem
os.environ["WECHAT_PAY_API_V3_KEY"] = API_V3_KEY
os.environ["WECHAT_PAY_PLATFORM_SERIAL"] = SERIAL
os.environ["WECHAT_PAY_PLATFORM_KEYS"] = json.dumps({ROTATED_SERIAL: _rotated_public_key_pem})

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def encrypt_resource(plaintext_obj: dict, apiv3_key: str, associated_data: str = "transaction") -> dict:
    """Encrypt a plaintext object into a WeChat Pay `resource` (AEAD_AES_256_GCM)."""
    aesgcm = AESGCM(apiv3_key.encode("utf-8"))
    nonce = base64.b16encode(os.urandom(6)).decode("ascii")[:12]  # 12-byte IV
    ciphertext = aesgcm.encrypt(
        nonce.encode("utf-8"),
        json.dumps(plaintext_obj).encode("utf-8"),
        associated_data.encode("utf-8"),
    )
    return {
        "algorithm": "AEAD_AES_256_GCM",
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
        "nonce": nonce,
        "associated_data": associated_data,
    }


def build_notification(event_type: str, resource_obj: dict, **overrides):
    """Build a signed WeChat Pay notification: returns (body, headers)."""
    notification = {
        "id": "EV-TEST-123",
        "create_time": "2018-06-08T10:34:56+08:00",
        "event_type": event_type,
        "resource_type": "encrypt-resource",
        "summary": "test",
        "resource": encrypt_resource(resource_obj, API_V3_KEY),
    }
    body = json.dumps(notification)
    timestamp = overrides.get("timestamp", str(int(time.time())))
    nonce = overrides.get("nonce", "test-nonce")
    message = f"{timestamp}\n{nonce}\n{body}\n".encode("utf-8")
    signing_key = overrides.get("private_key", _private_key)
    signature = overrides.get(
        "signature",
        base64.b64encode(
            signing_key.sign(message, padding.PKCS1v15(), hashes.SHA256())
        ).decode("ascii"),
    )
    headers = {
        "Content-Type": "application/json",
        "Wechatpay-Timestamp": timestamp,
        "Wechatpay-Nonce": nonce,
        "Wechatpay-Signature": signature,
        "Wechatpay-Serial": overrides.get("serial", SERIAL),
    }
    return body, headers


TRANSACTION = {
    "out_trade_no": "order-12345",
    "transaction_id": "4200001234",
    "trade_state": "SUCCESS",
    "amount": {"total": 100, "currency": "USD"},
}


class TestWeChatWebhook:
    def test_missing_headers_returns_400(self):
        response = client.post("/webhooks/wechat", content="{}",
                               headers={"Content-Type": "application/json"})
        assert response.status_code == 400

    def test_invalid_signature_returns_401(self):
        body, headers = build_notification(
            "TRANSACTION.SUCCESS", TRANSACTION,
            signature=base64.b64encode(b"not-a-real-signature").decode("ascii"),
        )
        response = client.post("/webhooks/wechat", content=body, headers=headers)
        assert response.status_code == 401

    def test_tampered_body_returns_401(self):
        body, headers = build_notification("TRANSACTION.SUCCESS", TRANSACTION)
        tampered = body.replace("EV-TEST-123", "EV-TAMPERED")
        response = client.post("/webhooks/wechat", content=tampered, headers=headers)
        assert response.status_code == 401

    def test_stale_timestamp_returns_400(self):
        old = str(int(time.time()) - 400)
        body, headers = build_notification("TRANSACTION.SUCCESS", TRANSACTION, timestamp=old)
        response = client.post("/webhooks/wechat", content=body, headers=headers)
        assert response.status_code == 400

    def test_unknown_serial_returns_actionable_400(self):
        body, headers = build_notification("TRANSACTION.SUCCESS", TRANSACTION,
                                           serial="SOME_OTHER_SERIAL")
        response = client.post("/webhooks/wechat", content=body, headers=headers)
        assert response.status_code == 400
        message = response.json()["message"]
        assert "No platform key configured for serial SOME_OTHER_SERIAL" in message
        assert "/v3/certificates" in message

    def test_rotated_serial_selects_matching_key(self):
        body, headers = build_notification("TRANSACTION.SUCCESS", TRANSACTION,
                                           serial=ROTATED_SERIAL,
                                           private_key=_rotated_private_key,
                                           nonce="rotated-nonce")
        response = client.post("/webhooks/wechat", content=body, headers=headers)
        assert response.status_code == 200
        assert response.json() == {"code": "SUCCESS", "message": "OK"}

    def test_wrong_key_for_serial_returns_401(self):
        # Signed with the old key but announcing the rotated serial.
        body, headers = build_notification("TRANSACTION.SUCCESS", TRANSACTION,
                                           serial=ROTATED_SERIAL,
                                           nonce="mismatched-nonce")
        response = client.post("/webhooks/wechat", content=body, headers=headers)
        assert response.status_code == 401

    def test_valid_transaction_returns_200(self):
        body, headers = build_notification("TRANSACTION.SUCCESS", TRANSACTION)
        response = client.post("/webhooks/wechat", content=body, headers=headers)
        assert response.status_code == 200
        assert response.json() == {"code": "SUCCESS", "message": "OK"}

    def test_handles_refund_events(self):
        for event_type in ("REFUND.SUCCESS", "REFUND.CLOSED"):
            refund = {"out_refund_no": "refund-1", "refund_id": "50000001"}
            body, headers = build_notification(event_type, refund, nonce=event_type)
            response = client.post("/webhooks/wechat", content=body, headers=headers)
            assert response.status_code == 200, f"Failed for {event_type}"

    def test_acknowledges_unknown_event(self):
        body, headers = build_notification("SOMETHING.ELSE", TRANSACTION, nonce="other")
        response = client.post("/webhooks/wechat", content=body, headers=headers)
        assert response.status_code == 200


class TestHelpers:
    def test_verify_signature_valid(self):
        from main import verify_signature

        timestamp, nonce, body = "1700000000", "abc", '{"hello":"world"}'
        message = f"{timestamp}\n{nonce}\n{body}\n".encode("utf-8")
        sig = base64.b64encode(
            _private_key.sign(message, padding.PKCS1v15(), hashes.SHA256())
        ).decode("ascii")
        assert verify_signature(timestamp, nonce, body, sig, _public_key_pem) is True

    def test_verify_signature_invalid(self):
        from main import verify_signature

        assert verify_signature("1", "n", "body", "not-base64", _public_key_pem) is False

    def test_decrypt_resource_roundtrip(self):
        from main import decrypt_resource

        resource = encrypt_resource(TRANSACTION, API_V3_KEY)
        assert decrypt_resource(resource, API_V3_KEY) == TRANSACTION


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
