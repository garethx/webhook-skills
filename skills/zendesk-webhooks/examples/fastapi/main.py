# Generated with: zendesk-webhooks skill
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

zendesk_secret = os.environ.get("ZENDESK_WEBHOOK_SECRET")


def verify_zendesk_webhook(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    """Verify a Zendesk webhook signature.

    Zendesk signs base64(HMAC_SHA256(secret, timestamp + raw_body)) — the
    timestamp is prepended directly to the raw body with no separator.
    """
    message = timestamp.encode("utf-8") + raw_body  # timestamp first, then body
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(expected, signature)


@app.post("/webhooks/zendesk")
async def zendesk_webhook(request: Request):
    # Read the raw body BEFORE parsing so the signature matches exactly
    raw_body = await request.body()
    signature = request.headers.get("x-zendesk-webhook-signature")
    timestamp = request.headers.get("x-zendesk-webhook-signature-timestamp")

    # Both headers are required
    if not signature or not timestamp:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Verify webhook signature before trusting anything in the payload
    if not verify_zendesk_webhook(raw_body, signature, timestamp, zendesk_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification. Empty body = no event to dispatch.
    payload = json.loads(raw_body) if raw_body else {}

    # Event subscriptions carry a CloudEvents-style `type` field.
    # Webhooks connected to a trigger/automation send custom JSON (no `type`).
    event_type = payload.get("type")
    detail = payload.get("detail", {})
    print(f"Received Zendesk webhook: {event_type or '(custom trigger payload)'}")

    if event_type == "zen:event-type:ticket.created":
        print(f"Ticket created: {detail.get('id')}")
        # TODO: Sync ticket to CRM, alert on-call, etc.

    elif event_type == "zen:event-type:ticket.status_changed":
        print(f"Ticket status changed: {detail.get('id')}")
        # TODO: Update dashboards, SLA tracking, etc.

    elif event_type == "zen:event-type:ticket.comment_added":
        print(f"Ticket comment added: {detail.get('id')}")
        # TODO: Mirror comment to chat, notify watchers, etc.

    elif event_type == "zen:event-type:ticket.priority_changed":
        print(f"Ticket priority changed: {detail.get('id')}")
        # TODO: Escalation routing, etc.

    elif event_type == "zen:event-type:ticket.agent_assignment_changed":
        print(f"Ticket assignee changed: {detail.get('id')}")
        # TODO: Notify the newly assigned agent, etc.

    elif event_type == "zen:event-type:user.created":
        print(f"User created: {detail.get('id')}")
        # TODO: Provision account, send welcome flow, etc.

    elif event_type == "zen:event-type:organization.created":
        print(f"Organization created: {detail.get('id')}")
        # TODO: Sync organization to billing/CRM, etc.

    else:
        # Either an event type you haven't subscribed to handle, or a custom
        # trigger/automation payload without a `type` field.
        print("Unhandled Zendesk webhook payload")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
