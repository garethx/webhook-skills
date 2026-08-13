"""Tests for the Google Cloud Pub/Sub push subscription handler.

Tokens are signed with a throwaway RSA key and `google-auth`'s own signer, and
only the network call that fetches Google's public keys is patched. The library
therefore performs a genuine RS256 signature verification, plus the real `aud`
and `exp` checks.
"""
import base64
import json
import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from google.auth import crypt, jwt
from google.oauth2 import id_token

from main import app

AUDIENCE = "https://example.com/webhooks/google-pubsub"
SERVICE_ACCOUNT = "pubsub-push@my-project.iam.gserviceaccount.com"
SUBSCRIPTION = "projects/my-project/subscriptions/my-sub"
KID = "test-key-id"

client = TestClient(app)

# Stand-in for Google's signing key.
_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PRIVATE_KEY_PEM = _key.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
).decode()
PUBLIC_KEY_PEM = (
    _key.public_key()
    .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    .decode()
)

_signer = crypt.RSASigner.from_string(PRIVATE_KEY_PEM, KID)


@pytest.fixture(autouse=True)
def google_keys(monkeypatch):
    """Serve the test public key instead of fetching Google's."""
    monkeypatch.setattr(id_token, "_fetch_certs", lambda request, certs_url: {KID: PUBLIC_KEY_PEM})


@pytest.fixture(autouse=True)
def oidc_env(monkeypatch):
    """Default to a correctly configured OIDC push subscription."""
    monkeypatch.setenv("PUBSUB_AUDIENCE", AUDIENCE)
    monkeypatch.setenv("PUBSUB_SERVICE_ACCOUNT_EMAIL", SERVICE_ACCOUNT)
    monkeypatch.delenv("PUBSUB_VERIFICATION_TOKEN", raising=False)
    monkeypatch.delenv("PUBSUB_SUBSCRIPTION", raising=False)
    monkeypatch.delenv("PUBSUB_ALLOW_UNAUTHENTICATED", raising=False)


def create_token(**overrides):
    """Mint an OIDC token shaped exactly like the one Pub/Sub attaches."""
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": AUDIENCE,
        "azp": "113774264463038321964",
        "sub": "113774264463038321964",
        "email": SERVICE_ACCOUNT,
        "email_verified": True,
        "iat": now,
        "exp": now + 3600,
    }
    claims.update(overrides)
    return jwt.encode(_signer, claims).decode()


def push_envelope(data={"orderId": "123", "total": 4995}, attributes=None, subscription=SUBSCRIPTION):
    """Build a wrapped push envelope. `data` is base64; pass None for attribute-only."""
    message = {"messageId": "2070443601311540", "publishTime": "2026-08-13T19:13:12.201Z"}
    if data is not None:
        message["data"] = base64.b64encode(json.dumps(data).encode()).decode()
    if attributes:
        message["attributes"] = attributes
    return {"message": message, "subscription": subscription}


def post(body=None, token=None, url="/webhooks/google-pubsub"):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    content = body if isinstance(body, str) else json.dumps(body if body is not None else push_envelope())
    return client.post(url, content=content, headers=headers)


# --- OIDC token verification ---------------------------------------------


def test_acks_push_with_valid_token():
    assert post(token=create_token()).status_code == 204


def test_rejects_request_with_no_authorization_header():
    response = post()
    assert response.status_code == 401
    assert response.text == "Invalid OIDC token"


def test_rejects_non_bearer_scheme():
    response = client.post(
        "/webhooks/google-pubsub",
        content=json.dumps(push_envelope()),
        headers={"Authorization": f"Basic {create_token()}"},
    )
    assert response.status_code == 401


def test_rejects_token_for_different_audience():
    assert post(token=create_token(aud="https://attacker.example.com")).status_code == 401


def test_rejects_token_from_different_service_account():
    # A real, correctly-signed Google token with the right audience is still not
    # good enough — it must be OUR push service account.
    token = create_token(email="other@other.iam.gserviceaccount.com")
    assert post(token=token).status_code == 401


def test_rejects_token_with_email_not_verified():
    assert post(token=create_token(email_verified=False)).status_code == 401


def test_rejects_token_from_non_google_issuer():
    assert post(token=create_token(iss="https://accounts.evil.example.com")).status_code == 401


def test_rejects_expired_token():
    past = int(time.time()) - 7200
    assert post(token=create_token(iat=past, exp=past + 3600)).status_code == 401


def test_rejects_tampered_signature():
    header, payload, signature = create_token().split(".")
    # Flip a leading character: the trailing base64url character can carry
    # unused bits, so changing it does not always change the decoded bytes.
    flipped = ("B" if signature[0] == "A" else "A") + signature[1:]
    assert post(token=f"{header}.{payload}.{flipped}").status_code == 401


def test_rejects_swapped_payload():
    header, _, signature = create_token().split(".")
    forged = (
        base64.urlsafe_b64encode(
            json.dumps({"iss": "https://accounts.google.com", "aud": AUDIENCE, "email": SERVICE_ACCOUNT}).encode()
        )
        .decode()
        .rstrip("=")
    )
    assert post(token=f"{header}.{forged}.{signature}").status_code == 401


def test_rejects_token_signed_with_unknown_key_id():
    unknown_signer = crypt.RSASigner.from_string(PRIVATE_KEY_PEM, "unknown-kid")
    now = int(time.time())
    token = jwt.encode(
        unknown_signer,
        {
            "iss": "https://accounts.google.com",
            "aud": AUDIENCE,
            "email": SERVICE_ACCOUNT,
            "email_verified": True,
            "iat": now,
            "exp": now + 3600,
        },
    ).decode()
    assert post(token=token).status_code == 401


# --- push envelope handling ----------------------------------------------


def test_acks_attribute_only_message():
    envelope = push_envelope(data=None, attributes={"eventType": "heartbeat"})
    assert "data" not in envelope["message"]
    assert post(envelope, create_token()).status_code == 204


def test_acks_message_whose_data_is_not_json():
    envelope = push_envelope()
    envelope["message"]["data"] = base64.b64encode(b"plain text payload").decode()
    assert post(envelope, create_token()).status_code == 204


def test_rejects_envelope_with_no_message():
    response = post({"subscription": SUBSCRIPTION}, create_token())
    assert response.status_code == 400
    assert response.text == "Invalid Pub/Sub push envelope"


def test_rejects_message_with_no_message_id():
    envelope = {"message": {"publishTime": "2026-08-13T19:13:12.201Z"}, "subscription": SUBSCRIPTION}
    assert post(envelope, create_token()).status_code == 400


def test_rejects_malformed_json_body():
    response = post("{ not json", create_token())
    assert response.status_code == 400
    assert response.text == "Invalid JSON body"


def test_authenticates_before_parsing_the_envelope():
    # A bad token on a malformed body must still be a 401, not a 400.
    response = post("{ not json", create_token(aud="https://wrong.example.com"))
    assert response.status_code == 401


# --- subscription allowlist ----------------------------------------------


def test_acks_push_from_expected_subscription(monkeypatch):
    monkeypatch.setenv("PUBSUB_SUBSCRIPTION", SUBSCRIPTION)
    assert post(token=create_token()).status_code == 204


def test_rejects_push_from_unexpected_subscription(monkeypatch):
    monkeypatch.setenv("PUBSUB_SUBSCRIPTION", "projects/my-project/subscriptions/other-sub")
    response = post(token=create_token())
    assert response.status_code == 403
    assert response.text == "Untrusted subscription"


# --- URL verification token (unauthenticated subscriptions) --------------


@pytest.fixture
def token_only_env(monkeypatch):
    monkeypatch.delenv("PUBSUB_AUDIENCE", raising=False)
    monkeypatch.delenv("PUBSUB_SERVICE_ACCOUNT_EMAIL", raising=False)
    monkeypatch.setenv("PUBSUB_VERIFICATION_TOKEN", "a-long-unguessable-token")


def test_acks_push_with_correct_url_token(token_only_env):
    response = post(url="/webhooks/google-pubsub?token=a-long-unguessable-token")
    assert response.status_code == 204


def test_rejects_push_with_wrong_url_token(token_only_env):
    response = post(url="/webhooks/google-pubsub?token=wrong")
    assert response.status_code == 401
    assert response.text == "Invalid verification token"


def test_rejects_push_with_no_url_token(token_only_env):
    assert post().status_code == 401


def test_still_requires_oidc_when_both_configured(token_only_env, monkeypatch):
    monkeypatch.setenv("PUBSUB_AUDIENCE", AUDIENCE)
    monkeypatch.setenv("PUBSUB_SERVICE_ACCOUNT_EMAIL", SERVICE_ACCOUNT)
    response = post(url="/webhooks/google-pubsub?token=a-long-unguessable-token")
    assert response.status_code == 401


# --- fail-closed configuration -------------------------------------------


@pytest.fixture
def unconfigured_env(monkeypatch):
    monkeypatch.delenv("PUBSUB_AUDIENCE", raising=False)
    monkeypatch.delenv("PUBSUB_SERVICE_ACCOUNT_EMAIL", raising=False)


def test_refuses_requests_when_no_authentication_configured(unconfigured_env):
    response = post()
    assert response.status_code == 500
    assert "not configured to authenticate" in response.text


def test_accepts_unauthenticated_push_only_with_explicit_opt_in(unconfigured_env, monkeypatch):
    # The Pub/Sub emulator sends no Authorization header.
    monkeypatch.setenv("PUBSUB_ALLOW_UNAUTHENTICATED", "true")
    assert post().status_code == 204


# --- health check ---------------------------------------------------------


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
