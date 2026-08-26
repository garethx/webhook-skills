# Generated with: supabase-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time

import pytest

# Secrets must be in the environment before the handlers read them.
# Database Webhooks: a value YOU choose and put in the trigger's headers JSON.
DB_SECRET = "db-webhook-shared-secret"
# Auth Hooks: the value Supabase issues, including the "v1,whsec_" prefix.
# The base64 part decodes to the raw HMAC key ("test_secret_key" here).
AUTH_SECRET = "v1,whsec_dGVzdF9zZWNyZXRfa2V5"

os.environ["SUPABASE_WEBHOOK_SECRET"] = DB_SECRET
os.environ["SUPABASE_AUTH_HOOK_SECRET"] = AUTH_SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign_auth_hook(
    raw_body: str, webhook_id: str, timestamp: str, secret: str = AUTH_SECRET
) -> str:
    """Sign a payload exactly the way Supabase Auth does.

    Standard Webhooks: base64(HMAC_SHA256(key, "{id}.{timestamp}.{raw_body}"))
    where `key` is the base64-DECODED portion after "v1,whsec_".
    """
    key = base64.b64decode(secret.replace("v1,whsec_", "") + "==")
    signature = base64.b64encode(
        hmac.new(
            key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256
        ).digest()
    ).decode()
    return f"v1,{signature}"


def now_seconds() -> int:
    return int(time.time())


def auth_headers(raw_body: str, **overrides) -> dict:
    webhook_id = overrides.get("webhook_id", "msg_test_1")
    timestamp = str(overrides.get("timestamp", now_seconds()))
    signature = overrides.get(
        "signature",
        sign_auth_hook(
            raw_body, webhook_id, timestamp, overrides.get("secret", AUTH_SECRET)
        ),
    )
    return {
        "content-type": "application/json",
        "webhook-id": webhook_id,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
    }


# --- Database Webhooks -----------------------------------------------------

INSERT_PAYLOAD = {
    "type": "INSERT",
    "table": "orders",
    "schema": "public",
    "record": {"id": 1, "status": "paid"},
    "old_record": None,
}


def test_database_webhook_accepts_bearer_shared_secret():
    response = client.post(
        "/webhooks/supabase",
        content=json.dumps(INSERT_PAYLOAD),
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {DB_SECRET}",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_database_webhook_accepts_x_webhook_secret_header():
    response = client.post(
        "/webhooks/supabase",
        content=json.dumps(INSERT_PAYLOAD),
        headers={
            "content-type": "application/json",
            "x-webhook-secret": DB_SECRET,
        },
    )

    assert response.status_code == 200


def test_database_webhook_rejects_missing_secret():
    response = client.post(
        "/webhooks/supabase",
        content=json.dumps(INSERT_PAYLOAD),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Unauthorized"


def test_database_webhook_rejects_wrong_secret():
    response = client.post(
        "/webhooks/supabase",
        content=json.dumps(INSERT_PAYLOAD),
        headers={
            "content-type": "application/json",
            "authorization": "Bearer not-the-secret",
        },
    )

    assert response.status_code == 401


def test_database_webhook_rejects_same_length_wrong_secret():
    response = client.post(
        "/webhooks/supabase",
        content=json.dumps(INSERT_PAYLOAD),
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {'x' * len(DB_SECRET)}",
        },
    )

    assert response.status_code == 401


def test_database_webhook_rejects_invalid_json():
    response = client.post(
        "/webhooks/supabase",
        content="not json",
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {DB_SECRET}",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


@pytest.mark.parametrize(
    "payload",
    [
        {
            "type": "UPDATE",
            "table": "orders",
            "schema": "public",
            "record": {"id": 1, "status": "shipped"},
            "old_record": {"id": 1, "status": "paid"},
        },
        {
            "type": "DELETE",
            "table": "orders",
            "schema": "public",
            "record": None,
            "old_record": {"id": 1, "status": "shipped"},
        },
        {"type": "TRUNCATE", "table": "orders", "schema": "public"},
    ],
    ids=["update", "delete", "unknown-type"],
)
def test_database_webhook_handles_payload_shapes(payload):
    response = client.post(
        "/webhooks/supabase",
        content=json.dumps(payload),
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {DB_SECRET}",
        },
    )

    assert response.status_code == 200


def test_authenticate_database_webhook_is_case_insensitive_about_bearer():
    from main import authenticate_database_webhook

    assert authenticate_database_webhook(
        {"authorization": f"bearer {DB_SECRET}"}, DB_SECRET
    )


def test_authenticate_database_webhook_without_configured_secret():
    from main import authenticate_database_webhook

    assert not authenticate_database_webhook(
        {"authorization": f"Bearer {DB_SECRET}"}, ""
    )


# --- Auth Hooks ------------------------------------------------------------


def test_auth_hook_verifies_valid_signature_send_email():
    body = json.dumps(
        {
            "user": {"id": "u1", "email": "user@example.com"},
            "email_data": {
                "token": "123456",
                "token_hash": "hash",
                "redirect_to": "http://localhost:3000/",
                "email_action_type": "signup",
                "site_url": "http://localhost:3000",
                "token_new": "",
                "token_hash_new": "",
                "old_email": "",
                "old_phone": "",
                "provider": "",
                "factor_type": "",
            },
        }
    )

    response = client.post(
        "/webhooks/supabase/auth-hook", content=body, headers=auth_headers(body)
    )

    assert response.status_code == 200
    assert response.json() == {}


def test_auth_hook_send_sms_returns_empty_object():
    body = json.dumps(
        {"user": {"id": "u1", "phone": "+15551234567"}, "sms": {"otp": "561166"}}
    )

    response = client.post(
        "/webhooks/supabase/auth-hook", content=body, headers=auth_headers(body)
    )

    assert response.status_code == 200
    assert response.json() == {}


def test_auth_hook_custom_access_token_returns_claims():
    body = json.dumps(
        {
            "user_id": "8ccaa7af-909f-44e7-84cb-67cdccb56be6",
            "claims": {
                "aud": "authenticated",
                "sub": "8ccaa7af-909f-44e7-84cb-67cdccb56be6",
                "role": "authenticated",
                "app_metadata": {},
                "user_metadata": {},
            },
            "authentication_method": "password",
        }
    )

    response = client.post(
        "/webhooks/supabase/auth-hook", content=body, headers=auth_headers(body)
    )

    assert response.status_code == 200
    assert response.json()["claims"]["role"] == "authenticated"


def test_auth_hook_before_user_created_allows_signup():
    body = json.dumps(
        {
            "metadata": {
                "uuid": "a1",
                "time": "2026-01-01T00:00:00Z",
                "name": "before-user-created",
                "ip_address": "127.0.0.1",
            },
            "user": {"id": "u1", "email": "user@example.com"},
        }
    )

    response = client.post(
        "/webhooks/supabase/auth-hook", content=body, headers=auth_headers(body)
    )

    assert response.status_code == 200
    assert response.json() == {}


def test_auth_hook_mfa_verification_attempt_returns_decision():
    body = json.dumps(
        {
            "factor_id": "6eab6a69-7766-48bf-95d8-bd8f606894db",
            "user_id": "3919cb6e-4215-4478-a960-6d3454326cec",
            "valid": True,
        }
    )

    response = client.post(
        "/webhooks/supabase/auth-hook", content=body, headers=auth_headers(body)
    )

    assert response.status_code == 200
    assert response.json() == {"decision": "continue"}


def test_auth_hook_password_verification_attempt_returns_decision():
    body = json.dumps(
        {"user_id": "3919cb6e-4215-4478-a960-6d3454326cec", "valid": True}
    )

    response = client.post(
        "/webhooks/supabase/auth-hook", content=body, headers=auth_headers(body)
    )

    assert response.status_code == 200
    assert response.json()["decision"] == "continue"
    assert response.json()["should_logout_user"] is False


def test_auth_hook_accepts_signature_list_with_one_match():
    """webhook-signature is a space-delimited list to allow secret rotation."""
    body = json.dumps({"user_id": "u1", "valid": True})
    webhook_id = "msg_rotation"
    timestamp = str(now_seconds())
    good = sign_auth_hook(body, webhook_id, timestamp)

    response = client.post(
        "/webhooks/supabase/auth-hook",
        content=body,
        headers={
            "content-type": "application/json",
            "webhook-id": webhook_id,
            "webhook-timestamp": timestamp,
            "webhook-signature": f"v1,YmFkc2lnbmF0dXJl {good}",
        },
    )

    assert response.status_code == 200


def test_auth_hook_rejects_invalid_signature():
    body = json.dumps({"user_id": "u1", "valid": True})

    response = client.post(
        "/webhooks/supabase/auth-hook",
        content=body,
        headers=auth_headers(body, signature="v1,aW52YWxpZHNpZ25hdHVyZQ=="),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_auth_hook_rejects_signature_over_a_different_body():
    signed_body = json.dumps({"user_id": "u1", "valid": True})
    headers = auth_headers(signed_body)

    response = client.post(
        "/webhooks/supabase/auth-hook",
        content=json.dumps({"user_id": "u1", "valid": False}),
        headers=headers,
    )

    assert response.status_code == 400


def test_auth_hook_rejects_undecoded_base64_secret_as_key():
    """The classic Supabase bug: signing with the base64 TEXT, not the bytes."""
    body = json.dumps({"user_id": "u1", "valid": True})
    webhook_id = "msg_wrongkey"
    timestamp = str(now_seconds())
    bad = base64.b64encode(
        hmac.new(
            AUTH_SECRET.replace("v1,whsec_", "").encode(),
            f"{webhook_id}.{timestamp}.{body}".encode(),
            hashlib.sha256,
        ).digest()
    ).decode()

    response = client.post(
        "/webhooks/supabase/auth-hook",
        content=body,
        headers={
            "content-type": "application/json",
            "webhook-id": webhook_id,
            "webhook-timestamp": timestamp,
            "webhook-signature": f"v1,{bad}",
        },
    )

    assert response.status_code == 400


def test_auth_hook_rejects_timestamp_too_old():
    body = json.dumps({"user_id": "u1", "valid": True})

    response = client.post(
        "/webhooks/supabase/auth-hook",
        content=body,
        headers=auth_headers(body, timestamp=now_seconds() - 600),
    )

    assert response.status_code == 400


def test_auth_hook_rejects_timestamp_too_far_in_the_future():
    body = json.dumps({"user_id": "u1", "valid": True})

    response = client.post(
        "/webhooks/supabase/auth-hook",
        content=body,
        headers=auth_headers(body, timestamp=now_seconds() + 600),
    )

    assert response.status_code == 400


def test_auth_hook_rejects_missing_headers():
    body = json.dumps({"user_id": "u1", "valid": True})

    response = client.post(
        "/webhooks/supabase/auth-hook",
        content=body,
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 400
    assert "Missing required headers" in response.json()["detail"]


def test_auth_hook_rejects_signature_from_a_different_secret():
    body = json.dumps({"user_id": "u1", "valid": True})

    response = client.post(
        "/webhooks/supabase/auth-hook",
        content=body,
        headers=auth_headers(body, secret="v1,whsec_b3RoZXJfc2VjcmV0X2tleQ=="),
    )

    assert response.status_code == 400


# --- Health ----------------------------------------------------------------


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
