# Generated with: pylon-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

pylon_secret = os.environ.get("PYLON_WEBHOOK_SECRET", "")


def verify_pylon_webhook(
    raw_body: bytes, timestamp: str, signature_header: str, secret: str
) -> bool:
    """Verify a Pylon webhook signature.

    Pylon signs `timestamp + "." + raw_body` with HMAC-SHA256 and sends the
    result in the Pylon-Webhook-Signature header, prefixed with "hs256=".
    """
    if not signature_header or not timestamp:
        return False

    # Signed content is `timestamp + "." + raw_body`, hex digest, "hs256=" prefix.
    signed = timestamp.encode("utf-8") + b"." + raw_body
    expected = "hs256=" + hmac.new(
        secret.encode("utf-8"), signed, hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature_header, expected)


@app.post("/webhooks/pylon")
async def pylon_webhook(request: Request):
    # Read the raw body for signature verification (do not parse first)
    raw_body = await request.body()
    signature = request.headers.get("pylon-webhook-signature")
    timestamp = request.headers.get("pylon-webhook-timestamp")
    version = request.headers.get("pylon-webhook-version")

    # Verify webhook signature against the raw body
    if not verify_pylon_webhook(raw_body, timestamp, signature, pylon_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification succeeds
    payload = json.loads(raw_body)

    # NOTE: Pylon's event-type field and token format are not publicly
    # documented. Confirm these against your own destination configuration.
    event_type = payload.get("event_type") or payload.get("type")
    data = payload.get("data", payload)

    print(f"Received Pylon event: {event_type} (version: {version})")

    # Handle the event based on type (event names are illustrative)
    if event_type == "issue.created":
        print(f"Issue created: {data.get('id')} {data.get('title')}")
        # TODO: Mirror the issue, alert on-call, create a linked task, etc.

    elif event_type == "issue.updated":
        print(f"Issue updated: {data.get('id')} {data.get('state')}")
        # TODO: Sync fields, trigger SLA automations, etc.

    # Example shape only — a close event is NOT confirmed to exist under this
    # (or any) name. Replace with the real types from your destination.
    elif event_type == "issue.closed":
        print(f"Issue closed: {data.get('id')}")
        # TODO: Send CSAT survey, update reporting, close linked tasks, etc.

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2xx quickly to acknowledge receipt (Pylon documents no timeout)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
