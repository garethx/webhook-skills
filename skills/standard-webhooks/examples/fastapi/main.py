# Generated with: standard-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
import json

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from standardwebhooks.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Standard Webhooks Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/standard")
async def standard_webhook(
    request: Request,
    webhook_id: str = Header(None, alias="webhook-id"),
    webhook_timestamp: str = Header(None, alias="webhook-timestamp"),
    webhook_signature: str = Header(None, alias="webhook-signature"),
):
    """Handle Standard Webhooks with signature verification."""
    if not all([webhook_id, webhook_timestamp, webhook_signature]):
        raise HTTPException(
            status_code=400,
            detail="Missing required webhook headers (webhook-id, webhook-timestamp, webhook-signature)",
        )

    secret = os.environ.get("WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    body = await request.body()

    try:
        wh = Webhook(secret)
        # The standardwebhooks library returns the parsed JSON payload.
        event = wh.verify(
            body,
            {
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": webhook_signature,
            },
        )
    except WebhookVerificationError as err:
        message = str(err)
        if message == "Message timestamp too old":
            detail = "Timestamp too old"
        elif message == "Message timestamp too new":
            detail = "Timestamp too new"
        elif message == "No matching signature found":
            detail = "Invalid signature"
        else:
            detail = message or "Webhook verification failed"
        raise HTTPException(status_code=400, detail=detail)

    if not isinstance(event, dict):
        # Defensive: handler is JSON-only
        try:
            event = json.loads(body)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("type", "unknown")
    event_data = event.get("data", {}) or {}

    print(f"Received Standard Webhook: {event_type}")

    if event_type == "contact.created":
        print(f"Contact created: id={event_data.get('id')} email={event_data.get('email')}")
    elif event_type == "contact.updated":
        print(f"Contact updated: id={event_data.get('id')}")
    elif event_type == "contact.deleted":
        print(f"Contact deleted: id={event_data.get('id')}")
    elif event_type == "message.sent":
        print(f"Message sent: id={event_data.get('id')}")
    elif event_type == "message.failed":
        print(f"Message failed: id={event_data.get('id')} error={event_data.get('error')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return JSONResponse(content={"success": True, "type": event_type}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
