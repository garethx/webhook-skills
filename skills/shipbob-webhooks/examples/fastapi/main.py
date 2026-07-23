# Generated with: shipbob-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
import hmac
import hashlib
import base64
import json
from time import time

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="ShipBob Webhook Handler")

# Reject messages whose timestamp is outside this window (seconds) to prevent replay.
TIMESTAMP_TOLERANCE = 300  # 5 minutes


def verify_shipbob_signature(
    body: bytes,
    webhook_id: str,
    webhook_timestamp: str,
    webhook_signature: str,
    secret: str,
) -> bool:
    """Verify a ShipBob (Standard Webhooks) signature.

    signed_content = "{webhook-id}.{webhook-timestamp}.{raw_body}"
    key            = base64-decode(secret after 'whsec_')
    signature      = base64( HMAC_SHA256(key, signed_content) )
    """
    try:
        signed_content = f"{webhook_id}.{webhook_timestamp}.{body.decode()}".encode()

        # 'whsec_<base64>' -> strip prefix, base64-decode the remainder for the raw key
        secret_bytes = base64.b64decode(secret.split("_", 1)[1])

        expected = base64.b64encode(
            hmac.new(secret_bytes, signed_content, hashlib.sha256).digest()
        ).decode()

        # webhook-signature is space-delimited; each entry is "v1,<sig>"
        sent = [s.split(",", 1)[1] for s in webhook_signature.split(" ") if "," in s]

        # Timing-safe comparison; accept if ANY sent signature matches
        return any(hmac.compare_digest(expected, s) for s in sent)
    except Exception:
        return False


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/webhooks/shipbob")
async def shipbob_webhook(
    request: Request,
    webhook_id: str = Header(None),
    webhook_timestamp: str = Header(None),
    webhook_signature: str = Header(None),
    x_webhook_topic: str = Header(None),
):
    """Handle ShipBob webhooks with signature verification."""

    # Verify required signing headers are present
    if not all([webhook_id, webhook_timestamp, webhook_signature]):
        raise HTTPException(
            status_code=400,
            detail="Missing required webhook headers",
        )

    secret = os.environ.get("SHIPBOB_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the RAW body (bytes) — verify the exact bytes ShipBob signed.
    body = await request.body()

    # Verify signature first
    if not verify_shipbob_signature(
        body, webhook_id, webhook_timestamp, webhook_signature, secret
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Reject stale/replayed messages
    try:
        if abs(int(time()) - int(webhook_timestamp)) > TIMESTAMP_TOLERANCE:
            raise HTTPException(status_code=400, detail="Timestamp too old")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp")

    # Parse the verified body
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # The topic identifies the event; it is a header, not a body field.
    topic = x_webhook_topic or "unknown"
    # ShipBob retries; dedupe on webhook_id for idempotency.
    print(f"Received ShipBob webhook: {topic} (id={webhook_id})")

    if topic == "order.shipped":
        print("Order shipped:", event)
        # TODO: mark order shipped / notify customer
    elif topic == "order.shipment.delivered":
        print("Shipment delivered:", event)
        # TODO: trigger post-delivery workflow
    elif topic == "order.shipment.tracking.updated":
        print("Tracking updated:", event)
        # TODO: update tracking info
    elif topic == "order.shipment.exception":
        print("Shipment exception:", event)
        # TODO: alert support
    elif topic == "return.created":
        print("Return created:", event)
        # TODO: start RMA workflow
    elif topic == "wro.created":
        print("Warehouse Receiving Order created:", event)
        # TODO: track inbound inventory
    elif topic == "billing.charge.created":
        print("Billing charge created:", event)
        # TODO: reconcile invoice
    else:
        print(f"Unhandled topic: {topic}")

    return JSONResponse(content={"success": True, "topic": topic}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
