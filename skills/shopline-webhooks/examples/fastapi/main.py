# Generated with: shopline-webhooks skill
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


def verify_shopline_webhook(raw_body: bytes, hmac_header: str, secret: str) -> bool:
    """Verify a SHOPLINE webhook signature.

    SHOPLINE signs the raw request body with HMAC-SHA256 using the app secret and
    sends the digest in the ``X-Shopline-Hmac-Sha256`` header. The docs show a
    base64 digest (Shopify-style); a stray sample shows hex — so accept either.
    """
    if not hmac_header:
        return False

    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()

    # Accept base64 (documented) or hex (stray sample) — constant-time either way.
    return (
        hmac.compare_digest(hmac_header, base64.b64encode(digest).decode("utf-8"))
        or hmac.compare_digest(hmac_header, digest.hex())
    )


@app.post("/webhooks/shopline")
async def shopline_webhook(request: Request):
    # Read the raw body — SHOPLINE signs the raw bytes, not parsed JSON
    raw_body = await request.body()
    hmac_header = request.headers.get("x-shopline-hmac-sha256")
    topic = request.headers.get("x-shopline-topic")
    shop = request.headers.get("x-shopline-shop-domain")
    webhook_id = request.headers.get("x-shopline-webhook-id")

    # Verify webhook signature against the raw body
    secret = os.environ.get("SHOPLINE_APP_SECRET", "")
    if not verify_shopline_webhook(raw_body, hmac_header, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    payload = json.loads(raw_body)

    # Use the stable delivery ID to process each event idempotently
    print(f"Received {topic} from {shop} (delivery {webhook_id})")

    # Handle the event based on topic
    if topic == "orders/create":
        print(f"New order: {payload.get('id')}")
        # TODO: Process new order, sync to fulfillment, etc.

    elif topic == "orders/update":
        print(f"Order updated: {payload.get('id')}")
        # TODO: Update order status, sync changes, etc.

    elif topic == "orders/paid":
        print(f"Order paid: {payload.get('id')}")
        # TODO: Trigger fulfillment, record payment, etc.

    elif topic == "orders/cancelled":
        print(f"Order cancelled: {payload.get('id')}")
        # TODO: Refund processing, inventory adjustment, etc.

    elif topic == "products/create":
        print(f"New product: {payload.get('id')}")
        # TODO: Sync to external catalog, etc.

    elif topic == "products/update":
        print(f"Product updated: {payload.get('id')}")
        # TODO: Update external listings, etc.

    elif topic == "products/delete":
        print(f"Product deleted: {payload.get('id')}")
        # TODO: Remove from external catalog, etc.

    elif topic == "collect/create":
        print(f"Product added to collection: {payload.get('id')}")
        # TODO: Re-sync merchandising / category feeds, etc.

    elif topic == "collect/delete":
        print(f"Product removed from collection: {payload.get('id')}")
        # TODO: Re-sync merchandising / category feeds, etc.

    elif topic == "customers/create":
        print(f"New customer: {payload.get('id')}")
        # TODO: Welcome email, CRM sync, etc.

    elif topic == "app/uninstalled":
        print(f"App uninstalled from shop: {shop}")
        # TODO: Cleanup shop data, etc.

    else:
        print(f"Unhandled topic: {topic}")

    # Return 200 within 5 seconds to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
