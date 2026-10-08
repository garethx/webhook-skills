# Generated with: volume-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Volume FastAPI webhook receiver.

Fixtures DOCS_COMPLETED / DOCS_FAILED are the two signed test calls published in
Volume's webhook docs, signed with Volume's SANDBOX private key. They verify
against the key served by
https://api.sandbox.volumepay.io/.well-known/signature/pem (embedded below as
served: bare base64 SPKI). LIVE_PUBLIC_KEY is the live URL's key — a different key.

Round-trip tests sign with a local RSA-2048 key exactly as Volume does:
SHA256withRSA (PKCS#1 v1.5) over the raw body, standard base64.
"""

import base64
import hashlib
import hmac
import json
import os
import uuid

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi.testclient import TestClient

import main
from main import app, clear_key_cache, parse_public_key, payments, processed, reconcile, verify_volume_signature

SANDBOX_PUBLIC_KEY = (
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsGNLZsbc2TJL1m6q4WVxexNoVxLoBkCVPKj38OdNrHTojKXG1nq0npuEJcIc"
    "knO0T+8tntbjxk34ouWlypNkTJOXuc6MGrlqSkHKMMJ1oWOrTvk4YcYaTaTnxQ4siI9evORAv/GqtYpVeILfIN8Z1TqoPJdH9Xbglt"
    "D20s7bG4tdCYBdVqxcd2MqXOnuEU9qRrGegGqfFV2U8epw43drBwG81DI/4XgYV5bJFoSI6wLNUua4dEIDYonS+KWb6Hy9EwDgKHQT"
    "YSekVGu2O8NId2HybbRQ32C1qyussOlIMKsnUMTdUGm2FCRCFbMGPFduczdezZ/O+pFMcfgCFKs4mQIDAQAB"
)
LIVE_PUBLIC_KEY = (
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzVEMT+v6MpSwXElcrAlgyk/xlRPFHfhMP7Q/IGj9iN47pKNy8vWCm6v3rz1z"
    "T0T/0znnGJ4sU9eEMqbYVIghYcq4JBDIwXFyC5Jgc7xXXrtv4M3360Y7LI45UzbWvIIsNnIQg48V1S5DFtmGPxgt7FxppX/9aJHClV"
    "PCDBJ0WwfmMiuh3M50Xp3DXCEOKXhGrgRLejQouab2WGvPpunkgTY0z8wuLBJgtVHOo3yW1w7ZDGzDe0+ixL9JcCr/vmqmWMA+J7Kg"
    "4/9FIMGRXyNBPoPj5+lrY24/GAjakvDbw79KpUE7KgoKWrlTsuVLPjQ16uYiZKrDNeRZ0ASj/T8G3QIDAQAB"
)

DOCS_COMPLETED = {
    "body": b'{"paymentId":"3f2a2b69-6d42-4050-9c4f-7e8849bf683c","merchantPaymentId":"806","paymentStatus":"COMPLETED","errorDescription":null,"paymentRequest":{"amount":24.23,"currency":"GBP","reference":"payment-reference"},"paymentRefundData":null,"paymentMetadata":{"some-data":"some-value"}}',
    "authorization": "SHA256withRSA hnHI6qoo7p37NwtBFj332TWC9UUHFiMlwgKsI2XV+L1xKbIK4Vp+3b3bczrdM+8bLXNTRMvJJJ+5zr5uBXBhl9enN3Sfq/4q3gmdq1pGd0Gz0YaRUZxhNG2tkVq7LGtKeeWzg5PxfCy7PeD3D71C+SnUYa7fwT+KzKyPCMqk+uWjLws6pKysinOzh3aYmVhaW9DhH6gZtV2LLGQFHUsqtYClzOkQRxDePhJU8kf8tu8FyTYxJgN4+CZ7vXrD162L0zrcsHXZX1VvVS0GbguHz/JHIFRzqu+o3QpHoidnU+reXPoCQOBV420NaWwVy3Op5o3rFSAZvSwjwAczoQRfnw==",
}
DOCS_FAILED = {
    "body": b'{"paymentId":"183b5eee-0fbf-4863-b55a-7a72af84db1a","merchantPaymentId":"937","paymentStatus":"FAILED","errorDescription":"Payment was rejected","paymentRequest":{"amount":24.23,"currency":"GBP","reference":"payment-reference"},"paymentRefundData":null,"paymentMetadata":{"some-data":"some-value"}}',
    "authorization": "SHA256withRSA Th+qWdYLLh436/L0pZOgFgjfNa8jcLE5VTMM4IYEQz1yVkljudt0XMgShhWjqhy2+f0puV+FXfh3PWP3DMAV8FlgYdciyPpLqijy5Ruo2ALz0LPgunT/o6Y+7NAfWCnVDfWT17yqokeN+70QCX/Waq+2Ox8nu8a7bJVj6noiiMUfq5pLKKiQMqb1t7ebznrKGGvt0IUdQzIxfFQz/lT4V5Oar4lQZ3hNhjm/Rmde8ctJ3g2sVuY6Mqt5OiUZzWQl/zqEl5OR4zlzTrxCzlqyep9Yu5E3TRgz1J82gZMeZVFY7yxt/wj5Fre/zK6SWJmpShbqzK5fJ5D++4CS8nY+GA==",
}

TEST_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
TEST_PUBLIC_PEM = (
    TEST_PRIVATE_KEY.public_key()
    .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    .decode()
)

client = TestClient(app, raise_server_exceptions=False)


def sign(body: bytes, private_key=TEST_PRIVATE_KEY) -> str:
    return base64.b64encode(private_key.sign(body, padding.PKCS1v15(), hashes.SHA256())).decode()


def make_payload(**overrides) -> dict:
    payload = {
        "paymentId": str(uuid.uuid4()),
        "merchantPaymentId": "order-1001",
        "paymentStatus": "COMPLETED",
        "errorDescription": None,
        "paymentRequest": {"amount": 100.0, "currency": "GBP", "reference": "REF123"},
        "paymentRefundData": None,
        "paymentMetadata": {"email": "email@mail.com"},
        "applicationId": "41f75930-ef98-40d8-b6f7-5ee2b01bd3b3",
        "isExternal": False,
    }
    payload.update(overrides)
    return payload


def compact(payload: dict) -> bytes:
    return json.dumps(payload, separators=(",", ":")).encode()


def send(body: bytes, authorization=None, method: str = "PUT"):
    headers = {"Content-Type": "application/json"}
    if authorization is not None:
        headers["Authorization"] = authorization
    return client.request(method, "/webhooks/volume", content=body, headers=headers)


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.delenv("VOLUME_PEM_URL", raising=False)
    monkeypatch.delenv("VOLUME_ENV", raising=False)
    monkeypatch.setenv("VOLUME_PUBLIC_KEY", TEST_PUBLIC_PEM)
    clear_key_cache()
    payments.clear()
    processed.clear()


# --- Volume docs fixtures (sandbox key) -------------------------------------

SANDBOX_KEY = parse_public_key(SANDBOX_PUBLIC_KEY)


def test_docs_fixtures_verify_with_pkcs1v15_sha256():
    assert verify_volume_signature(DOCS_COMPLETED["body"], DOCS_COMPLETED["authorization"], SANDBOX_KEY)
    assert verify_volume_signature(DOCS_FAILED["body"], DOCS_FAILED["authorization"], SANDBOX_KEY)


def test_pss_rejects_the_real_signature():
    from cryptography.exceptions import InvalidSignature

    sig = base64.b64decode(DOCS_COMPLETED["authorization"].split(" ")[1])
    with pytest.raises(InvalidSignature):
        SANDBOX_KEY.verify(
            sig,
            DOCS_COMPLETED["body"],
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.AUTO),
            hashes.SHA256(),
        )


def test_one_byte_change_fails():
    tampered = DOCS_COMPLETED["body"].replace(b"24.23", b"24.24")
    assert not verify_volume_signature(tampered, DOCS_COMPLETED["authorization"], SANDBOX_KEY)


def test_reserialised_json_fails():
    reserialised = json.dumps(json.loads(DOCS_COMPLETED["body"])).encode()  # Python adds spaces
    assert not verify_volume_signature(reserialised, DOCS_COMPLETED["authorization"], SANDBOX_KEY)


def test_sandbox_signature_fails_against_live_key():
    live_key = parse_public_key(LIVE_PUBLIC_KEY)
    assert not verify_volume_signature(DOCS_COMPLETED["body"], DOCS_COMPLETED["authorization"], live_key)


def test_swapped_signature_fails():
    assert not verify_volume_signature(DOCS_COMPLETED["body"], DOCS_FAILED["authorization"], SANDBOX_KEY)


def test_docs_curl_call_end_to_end(monkeypatch):
    monkeypatch.setenv("VOLUME_PUBLIC_KEY", SANDBOX_PUBLIC_KEY)
    payments["3f2a2b69-6d42-4050-9c4f-7e8849bf683c"] = {
        "merchantPaymentId": "806",
        "amount_minor": 2423,
        "currency": "GBP",
    }
    res = send(DOCS_COMPLETED["body"], DOCS_COMPLETED["authorization"])
    assert res.status_code == 200
    assert res.json() == {"received": True, "processed": True}


# --- Authorization header parsing --------------------------------------------

TEST_KEY = parse_public_key(TEST_PUBLIC_PEM)
BODY = compact(make_payload())


def test_accepts_scheme_and_base64():
    assert verify_volume_signature(BODY, f"SHA256withRSA {sign(BODY)}", TEST_KEY)


def test_rejects_missing_header():
    assert not verify_volume_signature(BODY, None, TEST_KEY)


@pytest.mark.parametrize("scheme", ["Bearer", "RSA-SHA256", "sha256withrsa"])
def test_rejects_other_schemes(scheme):
    assert not verify_volume_signature(BODY, f"{scheme} {sign(BODY)}", TEST_KEY)


def test_rejects_bare_signature():
    assert not verify_volume_signature(BODY, sign(BODY), TEST_KEY)


def test_rejects_base64url_and_hex():
    raw = TEST_PRIVATE_KEY.sign(BODY, padding.PKCS1v15(), hashes.SHA256())
    assert not verify_volume_signature(BODY, f"SHA256withRSA {base64.urlsafe_b64encode(raw).decode()}", TEST_KEY)
    assert not verify_volume_signature(BODY, f"SHA256withRSA {raw.hex()}", TEST_KEY)


def test_rejects_hmac_signature():
    fake = base64.b64encode(hmac.new(b"secret", BODY, hashlib.sha256).digest()).decode()
    assert not verify_volume_signature(BODY, f"SHA256withRSA {fake}", TEST_KEY)


def test_rejects_other_private_key():
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert not verify_volume_signature(BODY, f"SHA256withRSA {sign(BODY, other)}", TEST_KEY)


# --- Endpoint ----------------------------------------------------------------

def seed(payload: dict, **record):
    payments[payload["paymentId"]] = {
        "merchantPaymentId": payload.get("merchantPaymentId"),
        "amount_minor": 10000,
        "currency": "GBP",
        **record,
    }


def test_accepts_valid_completed():
    payload = make_payload()
    seed(payload)
    body = compact(payload)
    res = send(body, f"SHA256withRSA {sign(body)}")
    assert res.status_code == 200
    assert res.json() == {"received": True, "processed": True}


def test_accepts_post_too():
    payload = make_payload(paymentStatus="FAILED", errorDescription="Payment was rejected")
    seed(payload)
    body = compact(payload)
    res = send(body, f"SHA256withRSA {sign(body)}", method="POST")
    assert res.status_code == 200
    assert res.json()["processed"] is True


def test_completed_then_settled_with_duplicate():
    payload = make_payload()
    seed(payload)
    completed = compact(payload)
    settled = compact({**payload, "paymentStatus": "SETTLED"})
    assert send(completed, f"SHA256withRSA {sign(completed)}").json()["processed"] is True
    assert send(completed, f"SHA256withRSA {sign(completed)}").json()["duplicate"] is True
    assert send(settled, f"SHA256withRSA {sign(settled)}").json()["processed"] is True


def test_amount_mismatch_acknowledged_not_processed():
    payload = make_payload(paymentRequest={"amount": 1.0, "currency": "GBP"})
    seed(payload)
    body = compact(payload)
    res = send(body, f"SHA256withRSA {sign(body)}")
    assert res.status_code == 200
    assert res.json() == {"received": True, "processed": False}


def test_missing_authorization_returns_400():
    assert send(BODY).status_code == 400


def test_tampered_body_returns_400():
    assert send(BODY.replace(b"100", b"999"), f"SHA256withRSA {sign(BODY)}").status_code == 400


def test_invalid_json_with_valid_signature_returns_400():
    body = b"not json"
    res = send(body, f"SHA256withRSA {sign(body)}")
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid JSON"


def test_unknown_status_returns_200():
    payload = make_payload(paymentStatus="SOMETHING_NEW")
    seed(payload)
    body = compact(payload)
    assert send(body, f"SHA256withRSA {sign(body)}").status_code == 200


# --- Public key resolution ---------------------------------------------------

def test_fetches_bare_key_and_caches(monkeypatch):
    monkeypatch.delenv("VOLUME_PUBLIC_KEY")
    monkeypatch.setenv("VOLUME_PEM_URL", "https://keys.example.test/pem")
    bare = "".join(line for line in TEST_PUBLIC_PEM.splitlines() if "-----" not in line)
    calls = []

    async def fake_fetch(url):
        calls.append(url)
        return bare

    monkeypatch.setattr(main, "fetch_pem", fake_fetch)
    for _ in range(2):
        payload = make_payload()
        seed(payload)
        body = compact(payload)
        assert send(body, f"SHA256withRSA {sign(body)}").status_code == 200
    assert calls == ["https://keys.example.test/pem"]


def test_env_selects_sandbox_or_live_url(monkeypatch):
    monkeypatch.delenv("VOLUME_PUBLIC_KEY")
    keys = {
        "https://api.sandbox.volumepay.io/.well-known/signature/pem": SANDBOX_PUBLIC_KEY,
        "https://api.volumepay.io/.well-known/signature/pem": LIVE_PUBLIC_KEY,
    }
    calls = []

    async def fake_fetch(url):
        calls.append(url)
        return keys[url]

    monkeypatch.setattr(main, "fetch_pem", fake_fetch)
    assert send(DOCS_COMPLETED["body"], DOCS_COMPLETED["authorization"]).status_code == 200
    assert calls[-1] == "https://api.sandbox.volumepay.io/.well-known/signature/pem"

    monkeypatch.setenv("VOLUME_ENV", "live")
    res = send(DOCS_COMPLETED["body"], DOCS_COMPLETED["authorization"])
    assert calls[-1] == "https://api.volumepay.io/.well-known/signature/pem"
    assert res.status_code == 400  # sandbox-signed call rejected by the live key


def test_fails_closed_when_key_unavailable(monkeypatch):
    monkeypatch.delenv("VOLUME_PUBLIC_KEY")

    async def broken_fetch(url):
        raise RuntimeError("network down")

    monkeypatch.setattr(main, "fetch_pem", broken_fetch)
    assert send(DOCS_COMPLETED["body"], DOCS_COMPLETED["authorization"]).status_code == 503


def test_fails_closed_on_garbage_key(monkeypatch):
    monkeypatch.delenv("VOLUME_PUBLIC_KEY")

    async def html_fetch(url):
        return "<html>maintenance</html>"

    monkeypatch.setattr(main, "fetch_pem", html_fetch)
    assert send(DOCS_COMPLETED["body"], DOCS_COMPLETED["authorization"]).status_code == 503


# --- reconcile ---------------------------------------------------------------

RECORD = {"merchantPaymentId": "order-1001", "amount_minor": 10000, "currency": "GBP"}


def test_reconcile_matches():
    assert reconcile(make_payload(), RECORD) == []


def test_reconcile_major_units():
    payload = make_payload(paymentRequest={"amount": 24.23, "currency": "GBP"})
    assert reconcile(payload, {"amount_minor": 2423, "currency": "GBP"}) == []


def test_reconcile_flags_each_mismatch():
    payload = make_payload(merchantPaymentId="other", paymentRequest={"amount": 99, "currency": "EUR"})
    assert reconcile(payload, RECORD) == ["amount mismatch", "currency mismatch", "merchantPaymentId mismatch"]


def test_reconcile_missing_record():
    assert reconcile(make_payload(), None) == ["no matching payment record"]
