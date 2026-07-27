import base64
import json
import os

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

# Generate one RSA key pair for the whole suite. Utila signs with RSA-4096 +
# SHA-512 + PSS; a 2048-bit key exercises the identical verification path and
# keeps the test fast. The PUBLIC key stands in for the one from the Console.
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_public_pem = _private_key.public_key().public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
)

# Set the env var before importing the app; the handler loads the key lazily.
os.environ["UTILA_WEBHOOK_PUBLIC_KEY"] = _public_pem.decode("utf-8")

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign_utila_request(raw_body: bytes) -> str:
    """Sign the raw body exactly the way Utila does: SHA-512 + PSS, base64."""
    signature = _private_key.sign(
        raw_body,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA512()),
            salt_length=padding.PSS.MAX_LENGTH,
        ),
        hashes.SHA512(),
    )
    return base64.b64encode(signature).decode("utf-8")


def post(body: str, signature: str | None):
    headers = {"content-type": "application/json"}
    if signature is not None:
        headers["x-utila-signature"] = signature
    return client.post("/webhooks/utila", data=body, headers=headers)


def test_missing_signature_returns_400():
    body = json.dumps({"id": "evt_1", "type": "WALLET_CREATED"})
    res = post(body, None)
    assert res.status_code == 400
    assert res.text == "Invalid signature"


def test_invalid_signature_returns_400():
    body = json.dumps({"id": "evt_2", "type": "WALLET_CREATED"})
    bogus = base64.b64encode(b"not-a-real-signature").decode("utf-8")
    res = post(body, bogus)
    assert res.status_code == 400
    assert res.text == "Invalid signature"


def test_tampered_body_returns_400():
    original = json.dumps(
        {
            "id": "evt_3",
            "type": "TRANSACTION_STATE_UPDATED",
            "resource": "vaults/v1/transactions/tx_1",
        }
    )
    signature = sign_utila_request(original.encode("utf-8"))
    tampered = json.dumps(
        {
            "id": "evt_3",
            "type": "TRANSACTION_STATE_UPDATED",
            "resource": "vaults/v1/transactions/tx_EVIL",
        }
    )
    res = post(tampered, signature)
    assert res.status_code == 400


def test_valid_signature_invalid_json_returns_400():
    raw = "this is not json"
    signature = sign_utila_request(raw.encode("utf-8"))
    res = post(raw, signature)
    assert res.status_code == 400
    assert res.text == "Invalid JSON"


def test_valid_signature_returns_200():
    body = json.dumps(
        {
            "id": "evt_4",
            "vault": "vaults/v1",
            "type": "TRANSACTION_CREATED",
            "resourceType": "TRANSACTION",
            "resource": "vaults/v1/transactions/tx_2",
        }
    )
    signature = sign_utila_request(body.encode("utf-8"))
    res = post(body, signature)
    assert res.status_code == 200
    assert res.json() == {"received": True}


@pytest.mark.parametrize(
    "event_type,resource_type,resource",
    [
        ("TRANSACTION_CREATED", "TRANSACTION", "vaults/v1/transactions/tx_a"),
        ("TRANSACTION_STATE_UPDATED", "TRANSACTION", "vaults/v1/transactions/tx_b"),
        ("WALLET_CREATED", "WALLET", "vaults/v1/wallets/w_a"),
        ("WALLET_ADDRESS_CREATED", "WALLET_ADDRESS", "vaults/v1/wallets/w_a/addresses/0x1"),
        (
            "TRANSACTION_AML_SCREENING_RESULT_READY",
            "TRANSACTION",
            "vaults/v1/transactions/tx_c",
        ),
        ("SOMETHING_ELSE", "TRANSACTION", "vaults/v1/transactions/tx_d"),
    ],
)
def test_handles_event_types(event_type, resource_type, resource):
    body = json.dumps(
        {
            "id": f"evt_{event_type}",
            "vault": "vaults/v1",
            "type": event_type,
            "resourceType": resource_type,
            "resource": resource,
        }
    )
    signature = sign_utila_request(body.encode("utf-8"))
    res = post(body, signature)
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
