# Generated with: frontapp-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("FRONT_WEBHOOK_SECRET", "")


def verify_front_signature(raw_body: bytes, timestamp: str, signature: str, secret: str) -> bool:
    """
    Verify a Front application webhook signature.
    Front signs `timestamp + ":" + rawBody` with HMAC-SHA256 (base64), keyed with the
    app signing key, and delivers it in the X-Front-Signature header.
    """
    if not timestamp or not signature:
        return False
    mac = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    mac.update((timestamp + ":").encode("utf-8"))
    mac.update(raw_body)
    expected = base64.b64encode(mac.digest()).decode("utf-8")
    return hmac.compare_digest(expected, signature)


@app.post("/webhooks/frontapp")
async def front_webhook(request: Request):
    # Read the raw body for signature verification (do not parse JSON first).
    raw_body = await request.body()

    # 1. Subscription validation: echo the X-Front-Challenge header within 10s.
    challenge = request.headers.get("x-front-challenge")
    if challenge:
        return {"challenge": challenge}

    # 2. Verify the signature on real events.
    timestamp = request.headers.get("x-front-request-timestamp")
    signature = request.headers.get("x-front-signature")

    if not signature:
        return Response(content="Missing X-Front-Signature header", status_code=400)

    if not verify_front_signature(raw_body, timestamp, signature, webhook_secret):
        print("Front webhook signature verification failed")
        return Response(content="Invalid signature", status_code=400)

    # 3. Parse and dispatch. `type` carries the event name.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON", status_code=400)

    event_type = event.get("type")
    payload = event.get("payload") or {}
    conversation = payload.get("conversation") or {}

    if event_type == "inbound":
        print(f"Inbound message received: {payload.get('id')}")
        # TODO: triage, sync to CRM, alert, etc.

    elif event_type == "outbound":
        print(f"Outbound message sent: {payload.get('id')}")
        # TODO: log reply, track SLA, etc.

    elif event_type == "move":
        print(f"Conversation moved: {conversation.get('id')}")
        # TODO: routing analytics, notifications, etc.

    elif event_type == "assign":
        print(f"Conversation assigned: {conversation.get('id')}")
        # TODO: workload tracking, escalation, etc.

    elif event_type == "archive":
        print(f"Conversation archived: {conversation.get('id')}")
        # TODO: close-out workflow, metrics, etc.

    elif event_type == "tag":
        print(f"Conversation tagged: {conversation.get('id')}")
        # TODO: categorization, automation, etc.

    elif event_type == "comment":
        print(f"Comment added: {conversation.get('id')}")
        # TODO: internal collaboration hooks, etc.

    elif event_type == "message_bounce_error":
        print(f"Message bounced: {payload.get('id')}")
        # TODO: bounce handling, list hygiene, etc.

    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge quickly (Front expects 2xx within 5s).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
