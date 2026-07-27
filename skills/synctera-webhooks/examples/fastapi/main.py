# Generated with: synctera-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

# Signing secret from POST /v0/webhook_secrets — NOT your API key
WEBHOOK_SECRET = os.environ.get("SYNCTERA_WEBHOOK_SECRET", "")
TOLERANCE_SECONDS = 5 * 60  # reject timestamps >5 minutes from now


def verify_synctera_signature(
    raw_body: bytes,
    signature_header: str | None,
    timestamp: str | None,
    secret: str,
    tolerance: int = TOLERANCE_SECONDS,
) -> bool:
    """Verify a Synctera webhook.

    Synctera signs ``{Request-Timestamp}.{raw_body}`` with HMAC-SHA256 and
    hex-encodes it. Headers: ``Synctera-Signature`` (hex; two "."-delimited
    signatures during a rolling secret) and ``Request-Timestamp`` (POSIX seconds).
    """
    if not signature_header or not timestamp or not timestamp.isdigit():
        return False

    # Replay protection: Request-Timestamp within 5 minutes of now
    if abs(int(time.time()) - int(timestamp)) > tolerance:
        return False

    # HMAC over `${timestamp}.${raw_body}` — the "." is a literal separator
    signed = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()

    # During a rolling secret, the header holds two "."-delimited signatures
    return any(
        hmac.compare_digest(candidate, expected)
        for candidate in signature_header.split(".")
    )


@app.post("/webhooks/synctera")
async def synctera_webhook(request: Request):
    # Read the RAW body — do not parse before verifying
    raw_body = await request.body()
    signature = request.headers.get("synctera-signature")
    timestamp = request.headers.get("request-timestamp")

    if not signature or not timestamp:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    if not verify_synctera_signature(raw_body, signature, timestamp, WEBHOOK_SECRET):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Signature verified — safe to parse
    event = json.loads(raw_body)
    event_type = event.get("type")

    if event_type == "ACCOUNT.UPDATED":
        print(f"Account updated: {event.get('account_id') or event.get('id')}")
        # TODO: sync account status/balance

    elif event_type == "CARD.CREATED":
        print(f"Card created: {event.get('card_id') or event.get('id')}")
        # TODO: provision card in your UI

    elif event_type == "CARD.UPDATED":
        print(f"Card updated: {event.get('card_id') or event.get('id')}")
        # TODO: reflect activation/lock status

    elif event_type == "TRANSACTION.CREATED":
        print(f"Transaction created: {event.get('transaction_id') or event.get('id')}")
        # TODO: show pending activity

    elif event_type == "TRANSACTION.UPDATED":
        print(f"Transaction updated: {event.get('transaction_id') or event.get('id')}")
        # TODO: reconcile ledger / update balances

    elif event_type == "DISPUTE.CREATED":
        print(f"Dispute created: {event.get('dispute_id') or event.get('id')}")
        # TODO: start dispute workflow

    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge within 5 seconds or Synctera retries
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
