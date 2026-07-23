# Generated with: solidgate-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import hmac
import base64
import hashlib

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

PUBLIC_KEY = os.environ.get("SOLIDGATE_WEBHOOK_PUBLIC_KEY", "")
SECRET_KEY = os.environ.get("SOLIDGATE_WEBHOOK_SECRET_KEY", "")


def verify_solidgate_signature(
    raw_body: bytes, signature: str, public_key: str, secret_key: str
) -> bool:
    """Verify a Solidgate webhook signature.

    Solidgate signs `publicKey + rawBody + publicKey` with HMAC-SHA512 using the
    webhook secret key, takes the HEX digest, then Base64-encodes that hex STRING
    (the double-encode quirk). This matches solidgate-sdk's internal signing.

    The Solidgate Python SDK has no public webhook-verification helper, so we
    verify manually against the raw request body.
    """
    message = public_key.encode("utf-8") + raw_body + public_key.encode("utf-8")
    hex_digest = hmac.new(
        secret_key.encode("utf-8"), message, hashlib.sha512
    ).hexdigest()
    expected = base64.b64encode(hex_digest.encode("utf-8")).decode("utf-8")
    return hmac.compare_digest(expected, signature)


@app.post("/webhooks/solidgate")
async def solidgate_webhook(request: Request):
    # Read the RAW body for signature verification (do not parse first)
    raw_body = await request.body()
    signature = request.headers.get("signature")
    merchant = request.headers.get("merchant")
    event_type = request.headers.get("solidgate-event-type")
    event_id = request.headers.get("solidgate-event-id")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature header")

    # The `merchant` header must match our configured public key
    if merchant and merchant != PUBLIC_KEY:
        raise HTTPException(status_code=400, detail="Invalid merchant")

    if not verify_solidgate_signature(raw_body, signature, PUBLIC_KEY, SECRET_KEY):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Safe to parse now that the signature is verified
    payload = json.loads(raw_body)
    order = payload.get("order", {})
    subscription = payload.get("subscription", {})

    # Deduplicate retried deliveries using the event id (idempotency)
    print(f"Received {event_type} (event {event_id})")

    if event_type == "card_gate.order.updated":
        print(f"Card order updated: {order.get('order_id')} {order.get('status')}")
        # TODO: fulfil order, reconcile payment, send receipt

    elif event_type == "card_gate.chargeback.received":
        print(f"Chargeback received: {order.get('order_id')}")
        # TODO: revoke access, update accounting, open dispute workflow

    elif event_type == "card_gate.fraud_alert.received":
        print(f"Fraud alert received: {order.get('order_id')}")
        # TODO: flag customer, pre-empt chargeback

    elif event_type == "card_gate.prevention_alert.received":
        print(f"Prevention alert received: {order.get('order_id')}")
        # TODO: auto-refund to avoid a chargeback

    elif event_type == "subscription.updated.v2":
        print(f"Subscription updated: {subscription.get('id')} {subscription.get('status')}")
        # TODO: grant/revoke entitlements, run dunning

    elif event_type == "alt_gate.order.updated":
        print(f"APM order updated: {order.get('order_id')} {order.get('status')}")
        # TODO: fulfil APM order, reconcile

    elif event_type == "alt_gate.paypal_dispute.received":
        print(f"PayPal dispute received: {order.get('order_id')}")
        # TODO: handle PayPal dispute

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2xx within 30s to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
