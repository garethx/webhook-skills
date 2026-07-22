# Generated with: uber-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Response

load_dotenv()

app = FastAPI()

uber_client_secret = os.environ.get("UBER_CLIENT_SECRET", "")


def verify_uber_webhook(raw_body: bytes, signature_header: str, client_secret: str) -> bool:
    """Verify an Uber Eats webhook signature.

    Uber signs the raw request body with HMAC-SHA256 keyed on your app's
    client secret and sends the digest as a lowercased hex string in the
    X-Uber-Signature header (no "sha256=" prefix).
    """
    if not signature_header:
        return False

    expected_signature = hmac.new(
        client_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison to prevent timing attacks
    return hmac.compare_digest(signature_header, expected_signature)


@app.post("/webhooks/uber")
async def uber_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    signature_header = request.headers.get("x-uber-signature")

    # Verify webhook signature against the raw body
    if not verify_uber_webhook(raw_body, signature_header, uber_client_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification. The event type is in the body.
    payload = json.loads(raw_body)
    event_type = payload.get("event_type")
    meta = payload.get("meta") or {}
    resource_href = payload.get("resource_href") or meta.get("resource_href")

    print(f"Received {event_type} event (id: {payload.get('event_id')})")

    # Handle the event based on its event_type
    if event_type == "orders.notification":
        print(f"New order created: {resource_href}")
        # TODO: Fetch the full order from resource_href, ingest into POS

    elif event_type == "orders.cancel":
        print(f"Order cancelled: {resource_href}")
        # TODO: Void the order, stop preparation

    elif event_type == "orders.failure":
        print(f"Order failed/cancelled (v1.0.0): {resource_href}")
        # TODO: Void the order, alert staff

    elif event_type == "orders.release":
        print(f"Order released (courier at geo-fence): {resource_href}")
        # TODO: Start final preparation / hand-off

    elif event_type == "orders.scheduled.notification":
        print(f"Scheduled order created: {resource_href}")
        # TODO: Queue the order for its scheduled time

    elif event_type == "order.fulfillment_issues.resolved":
        print(f"Fulfillment issue resolved: {resource_href}")
        # TODO: Update the order, resume preparation

    elif event_type == "store.provisioned":
        print(f"Store provisioned: {meta.get('resource_id')}")
        # TODO: Begin syncing menu/availability

    elif event_type == "store.deprovisioned":
        print(f"Store deprovisioned: {meta.get('resource_id')}")
        # TODO: Stop syncing, clean up

    elif event_type == "store.status.changed":
        print(f"Store status changed: {meta.get('status')}")
        # TODO: Reflect open/closed state in your system

    else:
        print(f"Unhandled event: {event_type}")

    # Acknowledge with HTTP 200 and an empty body
    return Response(status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
