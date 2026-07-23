# Generated with: walmart-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import base64
import json
import time
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

WALMART_WEBHOOK_SECRET = os.environ.get("WALMART_WEBHOOK_SECRET", "")

# Reject deliveries whose timestamp is older than this (seconds).
REPLAY_TOLERANCE_SECONDS = 5 * 60


def verify_walmart_webhook(
    method: str,
    path_with_query: str,
    timestamp: str,
    raw_body: bytes,
    signature: str,
    secret: str,
) -> bool:
    """Verify a Walmart performance webhook signature.

    Walmart signs a canonical string, NOT the raw body directly:
        <METHOD>\\n<PATH_AND_QUERY>\\n<WM_SEC.TIMESTAMP>\\n<SHA256_HEX_OF_RAW_BODY>
    signature = base64(HMAC_SHA256(secret, string_to_sign))
    """
    if not timestamp or not signature:
        return False

    body_hash = hashlib.sha256(raw_body).hexdigest()  # lowercase hex
    string_to_sign = "\n".join([method.upper(), path_with_query, timestamp, body_hash])
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")

    return hmac.compare_digest(signature, expected)


def is_timestamp_fresh(timestamp: str, tolerance_seconds: int = REPLAY_TOLERANCE_SECONDS) -> bool:
    """Reject stale deliveries (replay protection). WM_SEC.TIMESTAMP is Unix epoch seconds."""
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    return abs(int(time.time()) - ts) <= tolerance_seconds


def _path_with_query(request: Request) -> str:
    path = request.url.path
    if request.url.query:
        path = f"{path}?{request.url.query}"
    return path


@app.post("/webhooks/walmart")
async def walmart_webhook(request: Request):
    # Read the RAW body for signature verification (do not parse first).
    raw_body = await request.body()
    timestamp = request.headers.get("wm_sec.timestamp")
    signature = request.headers.get("wm_sec.signature")
    # key_id = request.headers.get("wm_sec.key_id")  # optional: select secret during rotation

    # 1. Verify the signature.
    if not verify_walmart_webhook(
        request.method,
        _path_with_query(request),
        timestamp,
        raw_body,
        signature,
        WALMART_WEBHOOK_SECRET,
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # 2. Reject stale/replayed deliveries.
    if not is_timestamp_fresh(timestamp):
        raise HTTPException(status_code=400, detail="Stale timestamp")

    # 3. Parse only after verification.
    payload = json.loads(raw_body)
    event_type = payload.get("eventType")

    # 4. Confirm the seller is one you're authorized to process.
    # if not is_authorized_seller(payload.get("sellerId")):
    #     return {"received": True}

    print(f"Received {event_type} ({payload.get('resourceName')}) for seller {payload.get('sellerId')}")

    # 5. Handle the event by type.
    resource = payload.get("resource", {})
    if event_type == "PO_CREATED":
        print(f"New purchase order: {resource.get('purchaseOrderId')}")
        # TODO: reserve inventory, acknowledge order, start pick/pack/ship
    elif event_type == "PO_LINE_AUTOCANCELLED":
        print(f"PO line auto-cancelled: {resource.get('purchaseOrderId')}")
        # TODO: release inventory, update OMS
    elif event_type == "INTENT_TO_CANCEL":
        print(f"Customer intent to cancel: {resource.get('purchaseOrderId')}")
        # TODO: halt fulfillment if not yet shipped
    elif event_type == "INVENTORY_OOS":
        print(f"Item out of stock: {resource}")
        # TODO: trigger replenishment
    elif event_type == "OFFER_PUBLISHED":
        print(f"Offer published: {resource}")
        # TODO: enable listing in your catalog
    elif event_type == "OFFER_UNPUBLISHED":
        print(f"Offer unpublished: {resource}")
        # TODO: investigate suppression
    elif event_type == "BUY_BOX_CHANGED":
        print(f"Buy Box changed: {resource}")
        # TODO: reprice, alert pricing team
    elif event_type == "RETURN_CREATED":
        print(f"Return created: {resource}")
        # TODO: start returns workflow
    elif event_type == "REPORT_STATUS":
        print(f"Report ready: {resource}")
        # TODO: download and ingest the report
    elif event_type == "SELLER_PERFORMANCE_ALARMS":
        print(f"Seller performance alarm: {resource}")
        # TODO: alert account team
    else:
        print(f"Unhandled eventType: {event_type}")

    # 6. Acknowledge only AFTER durable work. Respond within 3 seconds.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
