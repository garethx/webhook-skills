# Generated with: recharge-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import hmac
import hashlib
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

recharge_client_secret = os.environ.get("RECHARGE_API_CLIENT_SECRET")


def verify_recharge_webhook(raw_body: bytes, signature_header: str, client_secret: str) -> bool:
    """Verify a Recharge webhook signature.

    GOTCHA: despite the `X-Recharge-Hmac-Sha256` header name, this is NOT HMAC.
    It is a plain SHA-256 of (client_secret + raw_body), with the secret prepended,
    hex-encoded.
    """
    if not signature_header:
        return False

    digest = hashlib.sha256(
        client_secret.encode("utf-8") + raw_body  # secret first, then raw body
    ).hexdigest()

    # Constant-time comparison to avoid timing attacks
    return hmac.compare_digest(digest, signature_header)


@app.post("/webhooks/recharge")
async def recharge_webhook(request: Request):
    # Read the raw body for signature verification - do NOT parse JSON first.
    raw_body = await request.body()
    signature = request.headers.get("x-recharge-hmac-sha256")
    topic = request.headers.get("x-recharge-topic")

    # 1. Verify first
    if not verify_recharge_webhook(raw_body, signature, recharge_client_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # 2. Parse only after verification. Recharge wraps the resource by key,
    #    e.g. {"charge": {...}}, {"subscription": {...}}, {"order": {...}}.
    payload = json.loads(raw_body)

    print(f"Received {topic} webhook")

    # 3. Dispatch on the topic. Return 200 fast; do slow work asynchronously.
    if topic == "charge/created":
        print(f"Charge created: {payload.get('charge', {}).get('id')}")
        # TODO: pre-billing checks, previews, etc.

    elif topic == "charge/paid":
        print(f"Charge paid: {payload.get('charge', {}).get('id')}")
        # TODO: grant access, record revenue, trigger fulfillment, etc.

    elif topic == "charge/failed":
        print(f"Charge failed: {payload.get('charge', {}).get('id')}")
        # TODO: dunning, notify customer, etc.

    elif topic == "subscription/created":
        print(f"Subscription created: {payload.get('subscription', {}).get('id')}")
        # TODO: onboarding, provisioning, etc.

    elif topic == "subscription/cancelled":
        print(f"Subscription cancelled: {payload.get('subscription', {}).get('id')}")
        # TODO: revoke access, win-back flow, etc.

    elif topic == "order/created":
        print(f"Order created: {payload.get('order', {}).get('id')}")
        # TODO: sync to OMS/ERP, etc.

    elif topic == "order/processed":
        print(f"Order processed: {payload.get('order', {}).get('id')}")
        # TODO: trigger fulfillment, etc.

    elif topic == "customer/updated":
        print(f"Customer updated: {payload.get('customer', {}).get('id')}")
        # TODO: CRM sync, payment method updates, etc.

    else:
        print(f"Unhandled topic: {topic}")

    # Acknowledge receipt within 5 seconds
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
