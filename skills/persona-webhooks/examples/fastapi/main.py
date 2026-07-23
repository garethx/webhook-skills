# Generated with: persona-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("PERSONA_WEBHOOK_SECRET")


def verify_persona_signature(
    raw_body: bytes,
    header: str | None,
    secret: str,
) -> tuple[bool, str | None]:
    """Verify the Persona-Signature header.

    Header format:  t=<unix_seconds>,v1=<hex_signature>
    Signed content: f"{t}.{raw_body_str}"
    Algorithm:      HMAC-SHA256 with the per-webhook secret (wbhsec_...), hex.

    During secret rotation Persona sends TWO space-separated `t=...,v1=...`
    pairs (old + new secret). Accept the request if ANY v1 matches the secret
    you hold. Persona documents no timestamp tolerance — signature validity is
    the check; add your own replay window only if you need one.
    """
    if not header:
        return False, "Missing Persona-Signature header"

    body_str = raw_body.decode("utf-8")
    saw_pair = False

    for pair in header.split():
        parts = dict(p.split("=", 1) for p in pair.split(",") if "=" in p)
        t = parts.get("t")
        v1 = parts.get("v1")
        if not t or not v1:
            continue
        saw_pair = True

        expected = hmac.new(
            secret.encode("utf-8"),
            f"{t}.{body_str}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if hmac.compare_digest(v1, expected):
            return True, None

    if not saw_pair:
        return False, "Malformed Persona-Signature header"
    return False, "Invalid signature"


@app.post("/webhooks/persona")
async def persona_webhook(request: Request):
    raw_body = await request.body()
    header = request.headers.get("persona-signature")

    valid, error = verify_persona_signature(raw_body, header, webhook_secret)
    if not valid:
        raise HTTPException(status_code=400, detail=f"Webhook Error: {error}")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Persona payloads are JSON:API envelopes:
    #   data.attributes.name          -> event type (e.g. "inquiry.completed")
    #   data.attributes.payload.data  -> the affected object (same schema as the API)
    #   data.attributes.created-at    -> use to order events; delivery is not ordered
    attributes = (event.get("data") or {}).get("attributes") or {}
    event_name = attributes.get("name")
    obj = (attributes.get("payload") or {}).get("data") or {}
    obj_id = obj.get("id")

    # Persona may deliver duplicates and out of order — use event["data"]["id"]
    # as the idempotency key and order by data.attributes.created-at.
    if event_name == "inquiry.created":
        print(f"Inquiry created: {obj_id}")
    elif event_name == "inquiry.started":
        print(f"Inquiry started: {obj_id}")
    elif event_name == "inquiry.completed":
        print(f"Inquiry completed: {obj_id}")
    elif event_name == "inquiry.approved":
        print(f"Inquiry approved: {obj_id}")
    elif event_name == "inquiry.declined":
        print(f"Inquiry declined: {obj_id}")
    elif event_name == "inquiry.marked-for-review":
        print(f"Inquiry marked for review: {obj_id}")
    elif event_name == "inquiry.failed":
        print(f"Inquiry failed: {obj_id}")
    elif event_name == "inquiry.expired":
        print(f"Inquiry expired: {obj_id}")
    elif event_name == "verification.passed":
        print(f"Verification passed: {obj_id}")
    elif event_name == "verification.failed":
        print(f"Verification failed: {obj_id}")
    elif event_name == "account.created":
        print(f"Account created: {obj_id}")
    elif event_name == "account.archived":
        print(f"Account archived: {obj_id}")
    elif event_name == "case.created":
        print(f"Case created: {obj_id}")
    elif event_name == "case.resolved":
        print(f"Case resolved: {obj_id}")
    elif event_name == "report/watchlist.ready":
        print(f"Watchlist report ready: {obj_id}")
    else:
        print(f"Unhandled event type: {event_name}")

    # Persona treats 200/201/202/204 as success; anything else is retried.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
