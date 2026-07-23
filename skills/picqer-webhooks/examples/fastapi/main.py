# Generated with: picqer-webhooks skill
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

picqer_secret = os.environ.get("PICQER_WEBHOOK_SECRET")


def verify_picqer_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Picqer webhook signature.

    Picqer signs the raw request body with HMAC-SHA256 keyed on the per-hook
    secret, base64-encodes it, and sends it in the X-Picqer-Signature header.
    """
    if not signature_header or not secret:
        return False

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")

    return hmac.compare_digest(expected, signature_header)


@app.post("/webhooks/picqer")
async def picqer_webhook(request: Request):
    # Read the raw body for signature verification (never parse before verifying)
    raw_body = await request.body()
    signature = request.headers.get("x-picqer-signature")

    if not verify_picqer_webhook(raw_body, signature, picqer_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification
    payload = json.loads(raw_body)
    event = payload.get("event")
    event_triggered_at = payload.get("event_triggered_at")
    data = payload.get("data") or {}

    print(f"Received {event} (triggered at {event_triggered_at})")

    # Picqer sends no dedicated idempotency key. To deduplicate retried
    # deliveries, derive one from the resource ID in `data` plus the event and
    # its trigger time, e.g. f"{event}:{data.get('idorder')}:{event_triggered_at}".
    # TODO: deduplicate on that derived key

    # Dispatch on the event field in the payload (Picqer has no event header)
    if event == "orders.created":
        print(f"New order: {data.get('idorder')}")
        # TODO: sync order to ERP, trigger downstream flows, etc.

    elif event == "orders.completed":
        print(f"Order completed: {data.get('idorder')}")
        # TODO: notify customer, close order in other systems, etc.

    elif event == "orders.status_changed":
        print(f"Order status changed: {data.get('idorder')}")
        # TODO: keep external order state in sync

    elif event == "picklists.created":
        print(f"Picklist created: {data.get('idpicklist')}")
        # TODO: kick off picking workflows

    elif event == "picklists.closed":
        print(f"Picklist closed: {data.get('idpicklist')}")
        # TODO: trigger packing / shipping

    elif event == "picklists.shipments.created":
        print(f"Shipment created for picklist: {data.get('idpicklist')}")
        # TODO: send tracking info to the customer

    elif event == "products.created":
        print(f"Product created: {data.get('idproduct')}")
        # TODO: sync catalog to storefront

    elif event == "products.stock_changed":
        print(f"Product stock changed: {data.get('idproduct')}")
        # TODO: update stock on your storefront

    elif event == "purchase_orders.created":
        print(f"Purchase order created: {data.get('idpurchaseorder')}")
        # TODO: notify suppliers, sync procurement

    elif event == "returns.created":
        print(f"Return created: {data.get('idreturn')}")
        # TODO: start return handling / refunds

    else:
        print(f"Unhandled event: {event}")

    # Acknowledge quickly (Picqer expects 200/201/202 within 10 seconds)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
