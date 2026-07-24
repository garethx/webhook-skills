# Generated with: tebex-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("TEBEX_WEBHOOK_SECRET", "")


def verify_tebex_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Verify a Tebex webhook signature.

    Tebex signs the hex `X-Signature` header in TWO steps:
      1. SHA-256 hash the raw body (hex)
      2. HMAC-SHA256 that hash, keyed with the webhook secret (hex)
    i.e. hash_hmac('sha256', hash('sha256', body), secret)

    Always verify against the RAW body — a parsed/re-serialized body will not match.
    """
    body_hash = hashlib.sha256(raw_body).hexdigest()
    expected = hmac.new(
        secret.encode(), body_hash.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


@app.post("/webhooks/tebex")
async def tebex_webhook(request: Request):
    # Read the raw body — do not parse before verifying the signature
    raw_body = await request.body()
    signature = request.headers.get("x-signature")

    if not signature:
        return Response(content="Missing X-Signature header", status_code=400)

    if not verify_tebex_signature(raw_body, signature, webhook_secret):
        print("Tebex webhook signature verification failed")
        return Response(content="Invalid signature", status_code=400)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON", status_code=400)

    event_type = event.get("type")

    # Setup handshake: echo the id back with a 200 to activate the endpoint
    if event_type == "validation.webhook":
        print(f"Tebex validation.webhook received: {event.get('id')}")
        return {"id": event.get("id")}

    subject = event.get("subject")

    # Handle the event based on type
    if event_type == "payment.completed":
        print(f"Payment completed: {subject}")
        # TODO: Grant perks, deliver goods, fulfill the order

    elif event_type == "payment.declined":
        print(f"Payment declined: {subject}")
        # TODO: Notify the buyer, log the failure

    elif event_type == "payment.refunded":
        print(f"Payment refunded: {subject}")
        # TODO: Revoke perks, update accounting

    elif event_type in (
        "payment.dispute.opened",
        "payment.dispute.won",
        "payment.dispute.lost",
        "payment.dispute.closed",
    ):
        print(f"Dispute event {event_type}: {subject}")
        # TODO: Flag the account, gather evidence, update case state

    elif event_type == "recurring-payment.started":
        print(f"Subscription started: {subject}")
        # TODO: Provision recurring access

    elif event_type == "recurring-payment.renewed":
        print(f"Subscription renewed: {subject}")
        # TODO: Extend access, record the renewal

    elif event_type == "recurring-payment.ended":
        print(f"Subscription ended: {subject}")
        # TODO: Revoke recurring access

    elif event_type == "recurring-payment.cancellation.requested":
        print(f"Cancellation requested: {subject}")
        # TODO: Schedule end-of-term revocation

    elif event_type == "recurring-payment.cancellation.aborted":
        print(f"Cancellation aborted: {subject}")
        # TODO: Keep the subscription active

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2XX to acknowledge receipt (non-2XX triggers Tebex retries)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
