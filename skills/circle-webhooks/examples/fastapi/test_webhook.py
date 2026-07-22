import base64

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

import main

# Generate one ECDSA P-256 key pair for the whole suite. Circle signs with
# ECDSA_SHA_256 and returns a base64 DER (SPKI) public key; a P-256 key pair
# exercises the exact same verification path.
_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
_PUBLIC_KEY = _PRIVATE_KEY.public_key()

TEST_KEY_ID = "879dc113-5ca4-4ff7-a6b7-54652083fcf8"


@pytest.fixture(autouse=True)
def preload_public_key_cache():
    """Each test starts with the test public key installed under TEST_KEY_ID."""
    main.public_key_cache.clear()
    main.public_key_cache[TEST_KEY_ID] = _PUBLIC_KEY
    yield
    main.public_key_cache.clear()


@pytest.fixture
def client():
    return TestClient(main.app)


def sign_circle_request(raw_body: bytes, *, key_id: str = TEST_KEY_ID) -> dict[str, str]:
    signature = _PRIVATE_KEY.sign(raw_body, ec.ECDSA(hashes.SHA256()))
    return {
        "x-circle-signature": base64.b64encode(signature).decode(),
        "x-circle-key-id": key_id,
        "content-type": "application/json",
    }


def test_missing_headers_returns_400(client):
    response = client.post(
        "/webhooks/circle",
        content=b'{"notificationType":"payments"}',
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400


def test_invalid_signature_returns_400(client):
    payload = b'{"notificationType":"payments","payment":{"id":"pay_1","status":"paid"}}'
    headers = sign_circle_request(payload)
    headers["x-circle-signature"] = base64.b64encode(b"garbage").decode()
    response = client.post("/webhooks/circle", content=payload, headers=headers)
    assert response.status_code == 400


def test_tampered_body_returns_400(client):
    original = b'{"notificationType":"payments","payment":{"id":"pay_2","status":"paid","amount":"10.00"}}'
    headers = sign_circle_request(original)
    tampered = b'{"notificationType":"payments","payment":{"id":"pay_2","status":"paid","amount":"999.00"}}'
    response = client.post("/webhooks/circle", content=tampered, headers=headers)
    assert response.status_code == 400


def test_unknown_key_id_returns_400(client):
    payload = b'{"notificationType":"payments","payment":{"id":"pay_3","status":"paid"}}'
    # Sign correctly but reference a key id that is not cached and cannot be
    # fetched (no CIRCLE_API_KEY set) — verification must fail closed.
    headers = sign_circle_request(payload, key_id="unknown-key-id")
    response = client.post("/webhooks/circle", content=payload, headers=headers)
    assert response.status_code == 400


def test_valid_signature_returns_200(client):
    payload = b'{"notificationType":"payments","version":1,"payment":{"id":"pay_5","status":"paid"}}'
    headers = sign_circle_request(payload)
    response = client.post("/webhooks/circle", content=payload, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_head_validation_returns_200(client):
    response = client.head("/webhooks/circle")
    assert response.status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        b'{"notificationType":"paymentIntents","paymentIntent":{"id":"pi_1","timeline":[{"status":"active"},{"status":"created"}]}}',
        b'{"notificationType":"payments","payment":{"id":"pay_x","status":"paid"}}',
        b'{"notificationType":"transfers","transfer":{"id":"tr_1","status":"complete"}}',
        b'{"notificationType":"payouts","payout":{"id":"po_1","status":"complete"}}',
        b'{"notificationType":"unknownType","foo":"bar"}',
    ],
)
def test_handles_each_notification_type(client, payload):
    headers = sign_circle_request(payload)
    response = client.post("/webhooks/circle", content=payload, headers=headers)
    assert response.status_code == 200


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
