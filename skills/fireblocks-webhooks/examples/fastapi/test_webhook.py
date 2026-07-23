# Generated with: fireblocks-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json

import pytest
from fastapi.testclient import TestClient
from jwcrypto import jwk, jws

from main import FireblocksVerifier, app, get_verifier

KID = "test-key-1"


@pytest.fixture(scope="module")
def signing_key() -> jwk.JWK:
    return jwk.JWK.generate(kty="RSA", size=2048, kid=KID, alg="RS512")


@pytest.fixture(scope="module")
def client(signing_key: jwk.JWK) -> TestClient:
    # Build a local JWKS containing only the public half of our test key,
    # standing in for the Fireblocks regional JWKS endpoint.
    jwks = jwk.JWKSet()
    jwks.add(jwk.JWK.from_json(signing_key.export_public()))
    app.dependency_overrides[get_verifier] = lambda: FireblocksVerifier(jwks_set=jwks)
    yield TestClient(app)
    app.dependency_overrides.clear()


def sign_detached(raw_body: bytes, key: jwk.JWK, kid: str = KID) -> str:
    """Sign a raw body the way Fireblocks does: a detached RS512 JWS."""
    token = jws.JWS(raw_body)
    token.add_signature(key, alg="RS512", protected=json.dumps({"alg": "RS512", "kid": kid}))
    compact = token.serialize(compact=True)
    header, _, signature = compact.split(".")
    return f"{header}..{signature}"


def test_missing_signature_returns_400(client: TestClient):
    resp = client.post("/webhooks/fireblocks", content=b"{}")
    assert resp.status_code == 400


def test_malformed_signature_returns_400(client: TestClient):
    resp = client.post(
        "/webhooks/fireblocks",
        content=b"{}",
        headers={"Fireblocks-Webhook-Signature": "not-a-valid-jws"},
    )
    assert resp.status_code == 400


def test_invalid_signature_returns_400(client: TestClient):
    body = json.dumps({"eventType": "transaction.created", "data": {"id": "tx_1"}}).encode()
    resp = client.post(
        "/webhooks/fireblocks",
        content=body,
        headers={"Fireblocks-Webhook-Signature": "aGVhZGVy..c2ln"},
    )
    assert resp.status_code == 400


def test_tampered_payload_returns_400(client: TestClient, signing_key: jwk.JWK):
    original = json.dumps({"eventType": "transaction.created", "data": {"id": "tx_1"}}).encode()
    signature = sign_detached(original, signing_key)
    tampered = json.dumps(
        {"eventType": "transaction.created", "data": {"id": "tx_HACKED"}}
    ).encode()
    resp = client.post(
        "/webhooks/fireblocks",
        content=tampered,
        headers={"Fireblocks-Webhook-Signature": signature},
    )
    assert resp.status_code == 400


def test_wrong_key_returns_400(client: TestClient):
    other = jwk.JWK.generate(kty="RSA", size=2048, kid="other-kid", alg="RS512")
    body = json.dumps({"eventType": "transaction.created", "data": {"id": "tx_1"}}).encode()
    signature = sign_detached(body, other, kid="other-kid")
    resp = client.post(
        "/webhooks/fireblocks",
        content=body,
        headers={"Fireblocks-Webhook-Signature": signature},
    )
    assert resp.status_code == 400


def test_valid_signature_returns_200(client: TestClient, signing_key: jwk.JWK):
    body = json.dumps(
        {
            "id": "evt_1",
            "webhookId": "wh_1",
            "workspaceId": "ws_1",
            "eventType": "transaction.created",
            "createdAt": 1754494189479,
            "data": {"id": "tx_1", "status": "SUBMITTED"},
        }
    ).encode()
    signature = sign_detached(body, signing_key)
    resp = client.post(
        "/webhooks/fireblocks",
        content=body,
        headers={"Fireblocks-Webhook-Signature": signature},
    )
    assert resp.status_code == 200
    assert resp.json() == {"received": True}


@pytest.mark.parametrize(
    "event_type",
    [
        "transaction.created",
        "transaction.status.updated",
        "transaction.approval_status.updated",
        "transaction.network_records.processing_completed",
        "unknown.event.type",
    ],
)
def test_handles_event_types(client: TestClient, signing_key: jwk.JWK, event_type: str):
    body = json.dumps({"eventType": event_type, "data": {"id": "tx_1", "status": "COMPLETED"}}).encode()
    signature = sign_detached(body, signing_key)
    resp = client.post(
        "/webhooks/fireblocks",
        content=body,
        headers={"Fireblocks-Webhook-Signature": signature},
    )
    assert resp.status_code == 200


def test_health(client: TestClient):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
