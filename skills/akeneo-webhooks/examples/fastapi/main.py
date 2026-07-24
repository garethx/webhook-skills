# Generated with: akeneo-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import time
import hmac
import hashlib

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

# 5-minute replay window (seconds)
TIMESTAMP_TOLERANCE = 300

akeneo_secret = os.environ.get("AKENEO_WEBHOOK_SECRET", "")


def verify_akeneo_webhook(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    """Verify an Akeneo webhook signature.

    Akeneo signs `timestamp + "." + rawBody` with HMAC-SHA256 (hex) using the
    connection secret, sending the result in the x-akeneo-request-signature header.
    """
    if not signature or not timestamp:
        return False

    # Replay protection: reject stale requests
    try:
        age = int(time.time()) - int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(age) > TIMESTAMP_TOLERANCE:
        return False

    # Recompute HMAC over `timestamp + "." + rawBody`
    signed_content = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(
        secret.encode("utf-8"), signed_content, hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature, expected)


def handle_akeneo_event(event: dict) -> None:
    """Dispatch a single event by its `action`."""
    action = event.get("action")
    resource = (event.get("data") or {}).get("resource") or {}

    if action == "product.created":
        print("Product created:", resource.get("identifier"))
        # TODO: Sync new SKU downstream, index for search, etc.
    elif action == "product.updated":
        print("Product updated:", resource.get("identifier"))
        # TODO: Re-sync attributes, invalidate caches, etc.
    elif action == "product.removed":
        print("Product removed:", resource.get("identifier"))
        # TODO: Remove from storefront/catalog, etc.
    elif action == "product_model.created":
        print("Product model created:", resource.get("code"))
        # TODO: Create parent/variant groupings, etc.
    elif action == "product_model.updated":
        print("Product model updated:", resource.get("code"))
        # TODO: Re-sync model-level attributes, etc.
    elif action == "product_model.removed":
        print("Product model removed:", resource.get("code"))
        # TODO: Clean up variant groupings, etc.
    else:
        print(f"Unhandled event: {action}")


@app.post("/webhooks/akeneo")
async def akeneo_webhook(request: Request):
    # Read the RAW body for signature verification (do NOT parse first)
    raw_body = await request.body()
    signature = request.headers.get("x-akeneo-request-signature")
    timestamp = request.headers.get("x-akeneo-request-timestamp")

    # Verify webhook signature against the RAW body
    if not verify_akeneo_webhook(raw_body, signature, timestamp, akeneo_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification
    payload = json.loads(raw_body)
    events = payload.get("events") or []

    # Akeneo batches up to 10 events per request. Akeneo does not retry and expects
    # a fast 2xx — offload heavy work to a queue/worker in production.
    for event in events:
        handle_akeneo_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
