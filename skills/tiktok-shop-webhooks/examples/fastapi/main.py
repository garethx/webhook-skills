# Generated with: tiktok-shop-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

APP_KEY = os.environ.get("TIKTOK_SHOP_APP_KEY", "")
APP_SECRET = os.environ.get("TIKTOK_SHOP_APP_SECRET", "")

# TikTok delivers a numeric `type`, which it does not formally version.
# Resolve it to a stable event NAME and branch on that. Confirm the mapping
# against your Partner Center event subscriptions.
TYPE_TO_EVENT = {
    1: "ORDER_STATUS_CHANGE",
    2: "RECIPIENT_ADDRESS_UPDATE",
    3: "PACKAGE_UPDATE",
    4: "PRODUCT_STATUS_CHANGE",
    5: "SELLER_DEAUTHORIZATION",
}


def verify_tiktok_shop(
    raw_body: bytes, auth_header: str, app_key: str, app_secret: str
) -> bool:
    """Verify a TikTok Shop webhook signature.

    TikTok Shop signs: HMAC-SHA256(key=app_secret, message=app_key + raw_body),
    lowercase hex, delivered in the ``Authorization`` header (no "Bearer" prefix).
    There is no timestamp in the signature (no replay protection).
    """
    message = app_key.encode("utf-8") + raw_body  # raw bytes, NOT parsed JSON
    expected = hmac.new(
        app_secret.encode("utf-8"), message, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, auth_header or "")


@app.post("/webhooks/tiktok-shop")
async def tiktok_shop_webhook(request: Request):
    # Read the raw body for signature verification — do not parse first.
    raw_body = await request.body()
    auth_header = request.headers.get("authorization")

    if not auth_header:
        # TikTok Shop treats 401 as a rejected signature.
        return Response(status_code=401, content="Missing Authorization header")

    if not verify_tiktok_shop(raw_body, auth_header, APP_KEY, APP_SECRET):
        return Response(status_code=401, content="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(status_code=400, content="Invalid JSON")

    # Delivery is at-least-once: dedupe on tts_notification_id before processing.
    event_name = TYPE_TO_EVENT.get(payload.get("type"), f"UNKNOWN_TYPE_{payload.get('type')}")
    data = payload.get("data") or {}

    if event_name == "ORDER_STATUS_CHANGE":
        print(f"Order status changed: {data.get('order_id')} {data.get('order_status')}")
        # TODO: sync order, trigger fulfilment, notify customer, etc.

    elif event_name == "RECIPIENT_ADDRESS_UPDATE":
        print(f"Recipient address updated: {data.get('order_id')}")
        # TODO: refresh shipping label / warehouse record.

    elif event_name == "PACKAGE_UPDATE":
        print(f"Package updated: {data.get('package_id')}")
        # TODO: re-fetch package details, update tracking.

    elif event_name == "PRODUCT_STATUS_CHANGE":
        print(f"Product status changed: {data.get('product_id')}")
        # TODO: sync catalog availability.

    elif event_name == "SELLER_DEAUTHORIZATION":
        print(f"Seller deauthorized shop: {payload.get('shop_id')}")
        # TODO: disable sync, purge stored access tokens for this shop.

    else:
        print(f"Unhandled event (type={payload.get('type')}): {event_name}")

    # Acknowledge within 3 seconds: 200 with an empty body.
    return Response(status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
