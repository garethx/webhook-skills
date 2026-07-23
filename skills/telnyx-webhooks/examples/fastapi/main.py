# Generated with: telnyx-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import json
import os
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, Request, Response
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

load_dotenv()

app = FastAPI(title="Telnyx Webhook Handler")

# Reject webhooks whose timestamp is more than this many seconds old (replay defense).
# Matches Telnyx's official SDK default of 5 minutes.
TOLERANCE_SECONDS = 300


def verify_telnyx_signature(
    body: bytes,
    signature: str,
    timestamp: str,
    public_key: str,
) -> bool:
    """Verify a Telnyx webhook using Ed25519.

    Telnyx signs the string ``f"{timestamp}|"`` + raw body bytes with an Ed25519
    private key. Verify it with your account's base64 public key from
    Mission Control -> Account Settings -> Keys & Credentials -> Public Key.
    """
    # Enforce timestamp tolerance to block replays.
    try:
        webhook_time = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(int(time.time()) - webhook_time) > TOLERANCE_SECONDS:
        return False

    # Signed content is ``timestamp|body`` — use the RAW body, never re-serialized JSON.
    signed_payload = f"{timestamp}|".encode("utf-8") + body

    try:
        verify_key = VerifyKey(base64.b64decode(public_key))
        verify_key.verify(signed_payload, base64.b64decode(signature))
        return True
    except (BadSignatureError, ValueError):
        return False


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/telnyx")
async def telnyx_webhook(
    request: Request,
    telnyx_signature_ed25519: Optional[str] = Header(None),
    telnyx_timestamp: Optional[str] = Header(None),
):
    public_key = os.environ.get("TELNYX_PUBLIC_KEY")
    if not public_key:
        print("TELNYX_PUBLIC_KEY is not configured")
        return Response(content="Server configuration error", status_code=500)

    if not telnyx_signature_ed25519 or not telnyx_timestamp:
        return Response(content="Missing Telnyx signature headers", status_code=400)

    # Read the RAW body before parsing — Ed25519 verification operates on raw bytes.
    body = await request.body()
    if not verify_telnyx_signature(body, telnyx_signature_ed25519, telnyx_timestamp, public_key):
        return Response(content="Invalid signature", status_code=400)

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON payload", status_code=400)

    # Telnyx wraps every webhook in a `data` envelope.
    data = event.get("data") or {}
    event_type = data.get("event_type")
    payload = data.get("payload") or {}
    print(f"Received Telnyx event: {event_type} ({data.get('id')})")

    if event_type == "message.received":
        sender = payload.get("from") or {}
        print(
            "Inbound message: "
            f"id={payload.get('id')} from={sender.get('phone_number')} text={payload.get('text')!r}"
        )
        # TODO: process the inbound SMS/MMS.
    elif event_type == "message.sent":
        print(f"Message sent to carrier: id={payload.get('id')}")
        # TODO: record that the message left Telnyx.
    elif event_type == "message.finalized":
        recipients = payload.get("to") or []
        print(
            "Message finalized: "
            f"id={payload.get('id')} to={[(r.get('phone_number'), r.get('status')) for r in recipients]}"
        )
        # TODO: update delivery status (delivered / failed).
    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge fast: Telnyx expects a 2xx within 2000ms or it retries.
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
