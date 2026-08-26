# Generated with: supabase-webhooks skill
# https://github.com/hookdeck/webhook-skills

"""Supabase webhook receiver.

Supabase has TWO webhook surfaces with DIFFERENT security models:

1. Database Webhooks  -> POST /webhooks/supabase
   Postgres trigger -> pg_net. UNSIGNED. Supabase defines no HMAC, no signing
   secret and no verification header for this surface. The only authentication
   is whatever you put in the trigger's headers JSON.

2. Auth Hooks (HTTP)  -> POST /webhooks/supabase/auth-hook
   Supabase Auth -> your endpoint, signed per the Standard Webhooks spec
   (webhook-id / webhook-timestamp / webhook-signature).

Do not apply one's verification to the other.
"""

import hmac
import json
import os
from typing import Any, Mapping

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Supabase Webhook Handler")


# === Database Webhooks: developer-configured shared secret ==================


def authenticate_database_webhook(headers: Mapping[str, str], secret: str) -> bool:
    """Constant-time check of a DEVELOPER-CONFIGURED shared secret.

    Supabase Database Webhooks are unsigned. This only works because the same
    value is set in the webhook's HTTP headers, e.g.
    '{"Authorization":"Bearer <secret>"}' in the trigger definition.

    Accepts `Authorization: Bearer <secret>` or `x-webhook-secret`.
    """
    if not secret:
        return False
    authorization = headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        presented = authorization[7:].strip()
    else:
        presented = headers.get("x-webhook-secret", "")
    # Encode first: compare_digest raises TypeError on non-ASCII str input
    return hmac.compare_digest(presented.encode("utf-8"), secret.encode("utf-8"))


# === Auth Hooks: Standard Webhooks HMAC-SHA256 ==============================


def verify_auth_hook(raw_body: bytes, headers: Mapping[str, str], secret: str) -> Any:
    """Verify a Supabase Auth Hook using the `standardwebhooks` package.

    The secret is issued as `v1,whsec_<base64>`. Strip the `v1,whsec_` prefix —
    the library base64-DECODES what remains into the raw HMAC key. Using the
    base64 string itself as the key is the classic bug and rejects every real
    delivery.

    The library signs `{webhook-id}.{webhook-timestamp}.{raw_body}`, base64s the
    HMAC-SHA256, compares in constant time against every space-delimited
    `v1,<sig>` entry, and enforces a +/- 5 minute timestamp tolerance.

    Raises:
        WebhookVerificationError: when the request is not authentic.
    Returns:
        The parsed, verified payload.
    """
    wh = Webhook(secret.replace("v1,whsec_", ""))
    return wh.verify(raw_body, dict(headers))


# === Routes =================================================================


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/webhooks/supabase")
async def database_webhook(request: Request) -> JSONResponse:
    """Supabase Database Webhook receiver.

    Payload is always one of three shapes, discriminated by an UPPERCASE `type`:
        INSERT: {type, table, schema, record, old_record: null}
        UPDATE: {type, table, schema, record, old_record}
        DELETE: {type, table, schema, record: null, old_record}

    `record` / `old_record` mirror your table's columns, so their inner shape is
    defined by your schema, not by Supabase.
    """
    secret = os.environ.get("SUPABASE_WEBHOOK_SECRET")
    if not secret:
        print("SUPABASE_WEBHOOK_SECRET is not configured")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not authenticate_database_webhook(request.headers, secret):
        # 401, not 400: this is an authentication failure, not a malformed body
        raise HTTPException(status_code=401, detail="Unauthorized")

    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = payload.get("type")
    table = payload.get("table")
    schema = payload.get("schema")
    record = payload.get("record")
    old_record = payload.get("old_record")

    if event_type == "INSERT":
        print(f"INSERT on {schema}.{table}: {record}")
        # TODO: index the new row, enqueue onboarding, etc.
        # No delivery id is sent — dedupe on a primary key inside `record`
    elif event_type == "UPDATE":
        print(f"UPDATE on {schema}.{table}: {old_record} -> {record}")
        # TODO: diff `record` against `old_record` and sync downstream
    elif event_type == "DELETE":
        print(f"DELETE on {schema}.{table}: {old_record}")
        # TODO: tombstone downstream records; `record` is None here
    else:
        print(f"Unhandled Supabase Database Webhook type: {event_type}")

    # pg_net is fire-and-forget within the trigger's timeout_ms and Supabase
    # documents no retry policy — acknowledge fast, do slow work out of band.
    return JSONResponse(content={"received": True}, status_code=200)


@app.post("/webhooks/supabase/auth-hook")
async def auth_hook(request: Request) -> JSONResponse:
    """Supabase Auth Hook receiver (HTTP Hook variant).

    Auth Hooks are REQUEST/RESPONSE, not fire-and-forget: the auth flow blocks
    on this reply and the JSON returned below changes what Supabase Auth does
    next. The whole invocation has a 5-second budget INCLUDING up to three
    retries (on 429 / 503) at a two-second backoff — keep this handler fast. A
    429/503 is only retried if the response ALSO carries a non-empty
    `retry-after` header.

    Always respond with Content-Type: application/json. 204 is not supported by
    custom_access_token / mfa_verification_attempt /
    password_verification_attempt (they need a body), and 400/403 are turned
    into a 500 for your application.
    """
    secret = os.environ.get("SUPABASE_AUTH_HOOK_SECRET")
    if not secret:
        print("SUPABASE_AUTH_HOOK_SECRET is not configured")
        raise HTTPException(status_code=500, detail="Server configuration error")

    headers = request.headers
    if not (
        headers.get("webhook-id")
        and headers.get("webhook-timestamp")
        and headers.get("webhook-signature")
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing required headers "
                "(webhook-id, webhook-timestamp, webhook-signature)"
            ),
        )

    # CRITICAL: raw body — the signature covers the exact bytes received
    raw_body = await request.body()

    try:
        payload = verify_auth_hook(raw_body, headers, secret)
    except WebhookVerificationError as err:
        print(f"Supabase Auth Hook verification failed: {err}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Supabase sends no hook-name header, so the hook is inferred from the
    # payload shape. Configure one endpoint per hook if you prefer explicit
    # routing.

    if "email_data" in payload:
        # send_email: YOU are responsible for actually sending the email
        user = payload.get("user") or {}
        action = payload["email_data"].get("email_action_type")
        print(f"send_email for {user.get('email')}: {action}")
        # TODO: send via your provider using email_data.token / token_hash
        # To ask Supabase to retry, `retry-after` is REQUIRED alongside 429/503:
        # return JSONResponse(
        #     content={"error": {"http_code": 503, "message": "Email provider unavailable"}},
        #     status_code=503,
        #     headers={"retry-after": "true"},
        # )
        return JSONResponse(content={}, status_code=200)

    if "sms" in payload:
        # send_sms: YOU are responsible for actually sending the SMS
        user = payload.get("user") or {}
        print(f"send_sms to {user.get('phone')}: otp {payload['sms'].get('otp')}")
        # TODO: send via your SMS provider
        return JSONResponse(content={}, status_code=200)

    if "claims" in payload:
        # custom_access_token: return the claims you want in the issued JWT
        print(f"custom_access_token for {payload.get('user_id')}")
        return JSONResponse(content={"claims": payload["claims"]}, status_code=200)

    if (payload.get("metadata") or {}).get("name") == "before-user-created":
        # before_user_created: {} allows the signup; a 4xx + error object rejects
        user = payload.get("user") or {}
        print(f"before_user_created for {user.get('email')}")
        # Example rejection:
        # return JSONResponse(
        #     content={"error": {"http_code": 400, "message": "Signups blocked"}},
        #     status_code=400,
        # )
        return JSONResponse(content={}, status_code=200)

    if "factor_id" in payload:
        # mfa_verification_attempt
        print(
            f"mfa_verification_attempt user={payload.get('user_id')} "
            f"valid={payload.get('valid')}"
        )
        return JSONResponse(content={"decision": "continue"}, status_code=200)

    if "user_id" in payload and "valid" in payload:
        # password_verification_attempt
        print(
            f"password_verification_attempt user={payload.get('user_id')} "
            f"valid={payload.get('valid')}"
        )
        return JSONResponse(
            content={
                "decision": "continue",
                "message": "",
                "should_logout_user": False,
            },
            status_code=200,
        )

    print("Unhandled Supabase Auth Hook payload shape")
    return JSONResponse(content={}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
