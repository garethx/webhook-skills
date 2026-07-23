# Generated with: bigcommerce-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI()


def get_webhook() -> Webhook:
    """Build a Standard Webhooks verifier from the app's client secret.

    BigCommerce signs callbacks using the Standard Webhooks spec. The signing
    key is your app's CLIENT SECRET, base64-encoded. The standardwebhooks
    library base64-decodes whatever you pass in, so encoding the client secret
    first yields the raw client-secret bytes as the HMAC key.
    """
    client_secret = os.environ.get("BIGCOMMERCE_CLIENT_SECRET", "")
    encoded = base64.b64encode(client_secret.encode()).decode()
    return Webhook(encoded)


@app.post("/webhooks/bigcommerce")
async def bigcommerce_webhook(request: Request):
    # Read the RAW body — verification must run over the exact bytes
    # BigCommerce signed, before any JSON parsing.
    raw_body = await request.body()

    headers = {
        "webhook-id": request.headers.get("webhook-id", ""),
        "webhook-timestamp": request.headers.get("webhook-timestamp", ""),
        "webhook-signature": request.headers.get("webhook-signature", ""),
    }

    try:
        # verify() checks the HMAC-SHA256 signature over
        # `${webhook-id}.${webhook-timestamp}.${raw_body}`, enforces the
        # timestamp tolerance (replay protection), and returns the parsed JSON.
        # A malformed signature/header raises ValueError from base64 decoding;
        # treat it the same as a failed verification.
        event = get_webhook().verify(raw_body, headers)
    except (WebhookVerificationError, ValueError) as err:
        print(f"BigCommerce webhook verification failed: {err}")
        return Response(content="Invalid signature", status_code=400)

    # BigCommerce payloads are thin: `scope` is the event, `data` carries only
    # the resource type and id. Call back to the REST API to fetch full details.
    scope = event.get("scope")
    data = event.get("data") or {}
    resource_id = data.get("id")

    if scope == "store/order/created":
        print(f"Order created: {resource_id}")
        # TODO: Fetch the order via GET /v2/orders/{id}, fulfil, notify
    elif scope == "store/order/updated":
        print(f"Order updated: {resource_id}")
        # TODO: Re-sync order details
    elif scope == "store/order/statusUpdated":
        print(f"Order status updated: {resource_id}")
        # TODO: Fetch order status, trigger fulfilment or refund flows
    elif scope == "store/product/created":
        print(f"Product created: {resource_id}")
        # TODO: Index the new product in your catalog
    elif scope == "store/product/updated":
        print(f"Product updated: {resource_id}")
        # TODO: Re-sync product details
    elif scope == "store/product/deleted":
        print(f"Product deleted: {resource_id}")
        # TODO: Remove the product from your catalog
    elif scope == "store/product/inventory/updated":
        print(f"Product inventory updated: {resource_id}")
        # TODO: Update stock levels downstream
    elif scope == "store/customer/created":
        print(f"Customer created: {resource_id}")
        # TODO: Sync customer to CRM / marketing list
    elif scope == "store/cart/created":
        print(f"Cart created: {resource_id}")
        # TODO: Track cart for analytics
    elif scope == "store/cart/abandoned":
        print(f"Cart abandoned: {resource_id}")
        # TODO: Trigger an abandoned-cart recovery email
    else:
        print(f"Unhandled scope: {scope}")

    # Respond 200 immediately so BigCommerce marks delivery successful.
    # Do heavy work asynchronously (queue) to avoid retries and blocklisting.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
