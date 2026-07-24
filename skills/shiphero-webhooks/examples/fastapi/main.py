# Generated with: shiphero-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import base64
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

shiphero_secret = os.environ.get("SHIPHERO_WEBHOOK_SECRET", "")


def verify_shiphero_webhook(raw_body: bytes, hmac_header: str, secret: str) -> bool:
    """Verify a ShipHero webhook signature.

    ShipHero signs the RAW request body with HMAC-SHA256 keyed on the webhook's
    shared_signature_secret, base64-encoded, sent in `x-shiphero-hmac-sha256`.
    """
    if not hmac_header:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(expected, hmac_header)


@app.post("/webhooks/shiphero")
async def shiphero_webhook(request: Request):
    # Read the raw body for signature verification
    raw_body = await request.body()
    hmac_header = request.headers.get("x-shiphero-hmac-sha256")
    message_id = request.headers.get("x-shiphero-message-id")

    # Verify webhook signature against the raw body
    if not verify_shiphero_webhook(raw_body, hmac_header, shiphero_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification succeeds
    payload = json.loads(raw_body)

    # ShipHero has no topic header - the event type is in `webhook_type`
    webhook_type = payload.get("webhook_type")

    # Use X-Shiphero-Message-ID to deduplicate retried deliveries
    print(f'Received "{webhook_type}" webhook (message {message_id})')

    if webhook_type == "Order Allocated":
        print(f"Order allocated: {payload.get('order_number') or payload.get('order_id')}")
        # TODO: Trigger downstream fulfillment, notify customer, etc.

    elif webhook_type == "Shipment Update":
        print(f"Shipment update for order: {payload.get('order_number') or payload.get('order_id')}")
        # TODO: Send tracking email, update order status, etc.

    elif webhook_type == "Inventory Update":
        print(f"Inventory update for {len(payload.get('inventory', []))} item(s)")
        # TODO: Sync stock levels to storefront/ERP, etc.

    elif webhook_type == "Order Canceled":
        print(f"Order canceled: {payload.get('order_number') or payload.get('order_id')}")
        # TODO: Refund, restock, notify systems, etc.

    elif webhook_type == "PO Update":
        print(f"PO update: {payload.get('po_number') or payload.get('po_id')}")
        # TODO: Track inbound inventory / receiving, etc.

    elif webhook_type == "Return Update":
        print(f"Return update: {payload.get('return_id') or payload.get('rma')}")
        # TODO: Process refund, restock returned items, etc.

    elif webhook_type == "Tote Complete":
        print(f"Tote complete: {payload.get('tote_name') or payload.get('tote_id')}")
        # TODO: Track picking progress, etc.

    elif webhook_type == "Package Added":
        print(f"Package added to order: {payload.get('order_number') or payload.get('order_id')}")
        # TODO: Update packing / carton records, etc.

    else:
        print(f"Unhandled webhook type: {webhook_type}")

    # ShipHero expects a 2xx with this exact acknowledgement body
    return {"code": "200", "Status": "Success"}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
