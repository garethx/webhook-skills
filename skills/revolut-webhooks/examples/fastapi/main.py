# Generated with: revolut-webhooks skill
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

SIGNING_SECRET = os.environ.get("REVOLUT_SIGNING_SECRET", "")
TOLERANCE_MS = 5 * 60 * 1000  # Revolut recommends a 5-minute tolerance


def verify_revolut_signature(
    raw_body: bytes, timestamp: str, signature_header: str, secret: str
) -> bool:
    """Verify a Revolut webhook signature.

    Revolut signs ``v1.{timestamp}.{raw body}`` with HMAC-SHA256 (hex) using the
    webhook signing secret (wsk_...). The Revolut-Signature header holds one or
    more ``v1=<hex>`` values (comma-separated during secret rotation).
    """
    if not timestamp or not signature_header or not secret:
        return False

    # Reject stale timestamps. Header is a UNIX timestamp in milliseconds.
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    ts_ms = ts * 1000 if len(timestamp) <= 10 else ts  # tolerate seconds or ms
    if abs(time.time() * 1000 - ts_ms) > TOLERANCE_MS:
        return False

    signed_payload = f"v1.{timestamp}.".encode() + raw_body
    expected = "v1=" + hmac.new(
        secret.encode(), signed_payload, hashlib.sha256
    ).hexdigest()

    # Header may hold multiple signatures during rotation — accept any match.
    return any(
        hmac.compare_digest(sig.strip(), expected)
        for sig in signature_header.split(",")
    )


@app.post("/webhooks/revolut")
async def revolut_webhook(request: Request):
    # Read the raw body for signature verification (do not parse JSON first)
    raw_body = await request.body()
    signature = request.headers.get("revolut-signature")
    timestamp = request.headers.get("revolut-request-timestamp")

    if not signature or not timestamp:
        raise HTTPException(status_code=400, detail="Missing Revolut signature headers")

    if not verify_revolut_signature(raw_body, timestamp, signature, SIGNING_SECRET):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("event")
    order_id = event.get("order_id")

    if event_type == "ORDER_COMPLETED":
        print(f"Order completed: {order_id}")
        # TODO: Fulfil the order, send a receipt, etc.

    elif event_type == "ORDER_AUTHORISED":
        print(f"Order authorised: {order_id}")
        # TODO: Reserve stock / prepare capture, etc.

    elif event_type == "ORDER_CANCELLED":
        print(f"Order cancelled: {order_id}")
        # TODO: Release reserved stock, update order status, etc.

    elif event_type == "ORDER_PAYMENT_AUTHENTICATED":
        print(f"Payment authenticated: {order_id}")
        # TODO: Track authentication progress, etc.

    elif event_type == "ORDER_PAYMENT_DECLINED":
        print(f"Payment declined: {order_id}")
        # TODO: Notify the customer, offer another payment method, etc.

    elif event_type == "ORDER_PAYMENT_FAILED":
        print(f"Payment failed: {order_id}")
        # TODO: Retry, alert the customer, etc.

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
