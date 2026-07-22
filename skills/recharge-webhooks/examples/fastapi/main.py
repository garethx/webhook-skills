# Generated with: recharge-webhooks skill
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

recharge_client_secret = os.environ.get("RECHARGE_API_CLIENT_SECRET")

# Reject deliveries whose signed timestamp is more than 48 hours from now.
TIMESTAMP_TOLERANCE_SECONDS = 172800


def verify_recharge_webhook_timestamped(
    raw_body: bytes, signature_header: str, client_secret: str
) -> bool:
    """Verify a Recharge webhook using the recommended timestamp-bound scheme.

    The `X-Recharge-Webhook-Signature` header carries comma-separated key/value
    pairs in the form `t=<epoch>,v1=<hex>`. The signing input is
    `<timestamp>.<payload_json>` (timestamp, literal dot, exact raw body bytes),
    signed with HMAC-SHA-256 keyed by the API Client Secret, hex-encoded.
    """
    if not signature_header:
        return False

    # Parse `t=<epoch>,v1=<hex>` (future schemes may add v2=..., so parse by key).
    parts = {}
    for pair in signature_header.split(","):
        key, _, value = pair.partition("=")
        if key and value:
            parts[key.strip()] = value.strip()

    timestamp_str = parts.get("t")
    signature = parts.get("v1")
    if not timestamp_str or not timestamp_str.isdigit() or not signature:
        return False
    timestamp = int(timestamp_str)

    # Reject the delivery if abs(now - t) > 48 hours (replay protection).
    if abs(int(time.time()) - timestamp) > TIMESTAMP_TOLERANCE_SECONDS:
        return False

    # HMAC-SHA-256 over "<timestamp>.<raw body>", keyed by the client secret.
    digest = hmac.new(
        client_secret.encode("utf-8"),
        f"{timestamp}.".encode("utf-8") + raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Constant-time comparison to avoid timing attacks
    return hmac.compare_digest(digest, signature)


def verify_recharge_webhook_legacy(
    raw_body: bytes, signature_header: str, client_secret: str
) -> bool:
    """Verify a Recharge webhook using the legacy body-only scheme.

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
    timestamped_signature = request.headers.get("x-recharge-webhook-signature")
    legacy_signature = request.headers.get("x-recharge-hmac-sha256")

    # 1. Verify first. Prefer the recommended timestamp-bound scheme; fall back
    #    to the legacy body-only header only when the new header is absent.
    if timestamped_signature:
        verified = verify_recharge_webhook_timestamped(
            raw_body, timestamped_signature, recharge_client_secret
        )
    else:
        verified = verify_recharge_webhook_legacy(
            raw_body, legacy_signature, recharge_client_secret
        )

    if not verified:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # 2. Parse only after verification. Recharge wraps the resource by key,
    #    e.g. {"charge": {...}}, {"subscription": {...}}, {"order": {...}}.
    payload = json.loads(raw_body)

    # 3. Dispatch on the payload's top-level resource key. Recharge does NOT
    #    send a documented topic/action header - if you need to distinguish
    #    actions (created vs updated vs paid), register a distinct endpoint
    #    path per topic when creating the webhook subscription.
    #    (`included_objects` adds extra top-level keys, so match known
    #    resources rather than taking the only key.)
    resource = next(
        (
            key
            for key in ("charge", "subscription", "order", "customer", "address")
            if key in payload
        ),
        None,
    )

    print(f"Received {resource or 'unknown'} webhook")

    # Return 200 fast; do slow work asynchronously.
    if resource == "charge":
        print(f"Charge event: {payload['charge'].get('id')}")
        # TODO: grant access, record revenue, dunning, etc.

    elif resource == "subscription":
        print(f"Subscription event: {payload['subscription'].get('id')}")
        # TODO: onboarding, provisioning, revoke access, etc.

    elif resource == "order":
        print(f"Order event: {payload['order'].get('id')}")
        # TODO: sync to OMS/ERP, trigger fulfillment, etc.

    elif resource == "customer":
        print(f"Customer event: {payload['customer'].get('id')}")
        # TODO: CRM sync, payment method updates, etc.

    elif resource == "address":
        print(f"Address event: {payload['address'].get('id')}")
        # TODO: update shipping records, etc.

    else:
        print(f"Unhandled resource: {list(payload.keys())}")

    # Acknowledge receipt within 5 seconds
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
