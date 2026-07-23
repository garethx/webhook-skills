# Generated with: usps-webhooks skill
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

usps_secret = os.environ.get("USPS_WEBHOOK_SECRET")

# Warn once, not per request, when the subscription has no signing secret
_warned_no_secret = False


def warn_no_secret_once():
    global _warned_no_secret
    if _warned_no_secret:
        return
    _warned_no_secret = True
    print(
        "USPS_WEBHOOK_SECRET is not set: USPS notifications are being processed "
        "with NO per-message verification. Restrict inbound traffic to the USPS "
        "source IP ranges, or recreate the subscription with a 32-char `secret`."
    )


def verify_usps_signature(timestamp: str, payload: str, hmac_header: str, secret: str) -> bool:
    """Verify a USPS webhook signature.

    USPS signs `timestamp + payload` (the envelope's `timestamp` field
    concatenated with the raw, stringified `payload` field) with HMAC-SHA256
    keyed on the subscription `secret`, and sends the Base64 digest in the
    `X-HMAC` header (deprecated alias: `hmac-header`).
    """
    if not hmac_header or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(
            secret.encode("utf-8"),
            (timestamp + payload).encode("utf-8"),
            hashlib.sha256,
        ).digest()
    ).decode("utf-8")
    return hmac.compare_digest(expected, hmac_header)


@app.post("/webhooks/usps")
async def usps_webhook(request: Request):
    # The signature covers two envelope *fields* (timestamp + payload), not the
    # raw body - we read and parse the body ourselves so nothing touches the
    # `payload` string before verification.
    raw_body = await request.body()
    hmac_header = request.headers.get("x-hmac") or request.headers.get("hmac-header")

    # Parse the envelope to read the signed fields (timestamp + payload).
    # The inner `payload` is used verbatim for verification - never re-serialize it.
    try:
        envelope = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    subscription_type = envelope.get("subscriptionType")
    timestamp = envelope.get("timestamp", "")
    payload = envelope.get("payload", "")

    # Verify the signature over `timestamp + payload`. A subscription created
    # without a `secret` gets no X-HMAC header at all, so there is nothing to
    # verify - that is an explicit, documented branch (see
    # references/verification.md), not an accidental bypass.
    if not usps_secret:
        warn_no_secret_once()
    elif not verify_usps_signature(timestamp, payload, hmac_header, usps_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Only now is it safe to parse the inner payload
    try:
        tracking = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid payload")

    print(f"Received {subscription_type} notification ({envelope.get('subscriptionId')})")

    # Dispatch on subscription type. "TRACKING" is the confirmed value; USPS also
    # delivers a scan-event-extract schema (a single raw scan record), so always
    # keep the fallback branch - see references/overview.md.
    if subscription_type == "TRACKING":
        handle_tracking_event(tracking)
    else:
        print(f"Unhandled subscriptionType: {subscription_type}")

    # Acknowledge quickly. USPS has no documented retry - do heavy work async.
    return {"received": True}


def handle_tracking_event(tracking: dict):
    """Handle a TRACKING notification payload, dispatching on tracking status."""
    status = tracking.get("status")
    print(f"Tracking {tracking.get('trackingNumber')}: {status}")

    if status == "Pre-Shipment":
        pass  # TODO: Show "label created" in the customer's order status
    elif status == "Accepted":
        pass  # TODO: Mark order as shipped / in-network
    elif status == "In Transit":
        pass  # TODO: Update ETA / live tracking timeline
    elif status == "Out for Delivery":
        pass  # TODO: Send "arriving today" notification
    elif status == "Delivered":
        pass  # TODO: Close the shipment, request a review, release funds
    elif status == "Available for Pickup":
        pass  # TODO: Notify customer to collect the package
    elif status == "Delivery Attempt":
        pass  # TODO: Prompt customer to reschedule / update address
    elif status == "Alert":
        pass  # TODO: Alert support, notify customer of a delay
    else:
        print(f"Unhandled tracking status: {status}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
