import base64
import hashlib
import json
import os
import time

os.environ["EBAY_VERIFICATION_TOKEN"] = "test_verification_token_abcdef0123456789"
os.environ["EBAY_ENDPOINT"] = "https://example.com/webhooks/ebay"
os.environ["EBAY_ENV"] = "production"

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

import main
from main import app

client = TestClient(app)

# One ECDSA (P-256) key pair for the whole suite. eBay signs ECDSA + SHA-1 and
# serves the public key via getPublicKey; we preload the cache so no network /
# OAuth call is made.
_private_key = ec.generate_private_key(ec.SECP256R1())
_public_pem = (
    _private_key.public_key()
    .public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    .decode()
)

TEST_KID = "test-public-key-id-0001"


def preload_key(pem: str = _public_pem) -> None:
    main._key_cache[TEST_KID] = (pem, time.time() + 3600)


def sign_ebay(raw_body: bytes, private_key=_private_key, kid: str = TEST_KID) -> str:
    signature = private_key.sign(raw_body, ec.ECDSA(hashes.SHA1()))  # DER
    header = {
        "alg": "ecdsa",
        "kid": kid,
        "signature": base64.b64encode(signature).decode(),
        "digest": "SHA1",
    }
    return base64.b64encode(json.dumps(header).encode()).decode()


def account_deletion_payload() -> bytes:
    return json.dumps(
        {
            "metadata": {"topic": "MARKETPLACE_ACCOUNT_DELETION", "schemaVersion": "1.0"},
            "notification": {
                "notificationId": "ntf_1",
                "data": {"username": "test_user", "userId": "ma8vp1jySJC", "eiasToken": "tok"},
            },
        }
    ).encode()


# --- Endpoint challenge ---------------------------------------------------


def test_challenge_returns_sha256_hex():
    challenge_code = "abc123challenge"
    h = hashlib.sha256()
    h.update(challenge_code.encode())
    h.update(os.environ["EBAY_VERIFICATION_TOKEN"].encode())
    h.update(os.environ["EBAY_ENDPOINT"].encode())
    expected = h.hexdigest()

    res = client.get("/webhooks/ebay", params={"challenge_code": challenge_code})
    assert res.status_code == 200
    assert res.json() == {"challengeResponse": expected}


def test_challenge_missing_code_returns_400():
    res = client.get("/webhooks/ebay")
    assert res.status_code == 400


# --- Signature verification ----------------------------------------------


def test_missing_signature_header_returns_412():
    res = client.post(
        "/webhooks/ebay",
        content=account_deletion_payload(),
        headers={"content-type": "application/json"},
    )
    assert res.status_code == 412


def test_invalid_signature_returns_412():
    preload_key()
    bad_header = base64.b64encode(
        json.dumps({"alg": "ecdsa", "kid": TEST_KID, "signature": "bogus", "digest": "SHA1"}).encode()
    ).decode()
    res = client.post(
        "/webhooks/ebay",
        content=account_deletion_payload(),
        headers={"content-type": "application/json", "x-ebay-signature": bad_header},
    )
    assert res.status_code == 412


def test_tampered_body_returns_412():
    preload_key()
    body = account_deletion_payload()
    header = sign_ebay(body)
    tampered = json.dumps(
        {"metadata": {"topic": "MARKETPLACE_ACCOUNT_DELETION"}, "notification": {"notificationId": "evil"}}
    ).encode()
    res = client.post(
        "/webhooks/ebay",
        content=tampered,
        headers={"content-type": "application/json", "x-ebay-signature": header},
    )
    assert res.status_code == 412


def test_foreign_key_returns_412():
    preload_key()
    other = ec.generate_private_key(ec.SECP256R1())
    body = account_deletion_payload()
    header = sign_ebay(body, private_key=other)  # same known kid, foreign signer
    res = client.post(
        "/webhooks/ebay",
        content=body,
        headers={"content-type": "application/json", "x-ebay-signature": header},
    )
    assert res.status_code == 412


def test_valid_signature_returns_204():
    preload_key()
    body = account_deletion_payload()
    header = sign_ebay(body)
    res = client.post(
        "/webhooks/ebay",
        content=body,
        headers={"content-type": "application/json", "x-ebay-signature": header},
    )
    assert res.status_code == 204


@pytest.mark.parametrize(
    "topic",
    [
        "MARKETPLACE_ACCOUNT_DELETION",
        "ITEM_AVAILABILITY",
        "ITEM_PRICE_REVISION",
        "PRIORITY_LISTING_REVISION",
        "SOME_UNHANDLED_TOPIC",
    ],
)
def test_handles_topics(topic):
    preload_key()
    body = json.dumps(
        {
            "metadata": {"topic": topic},
            "notification": {"notificationId": f"ntf_{topic}", "data": {"userId": "u", "itemId": "i", "listingId": "l"}},
        }
    ).encode()
    header = sign_ebay(body)
    res = client.post(
        "/webhooks/ebay",
        content=body,
        headers={"content-type": "application/json", "x-ebay-signature": header},
    )
    assert res.status_code == 204


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
