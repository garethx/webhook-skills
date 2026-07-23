# Generated with: fireflies-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

fireflies_secret = os.environ.get("FIREFLIES_WEBHOOK_SECRET")


def verify_fireflies_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify Fireflies webhook signature.

    Fireflies signs the raw request body with HMAC-SHA256 keyed on your webhook
    secret and sends the digest in the ``x-hub-signature`` header as a bare hex
    string (no ``sha256=`` prefix). Compare against the header value directly.
    """
    if not signature_header:
        return False

    # Compute expected signature over the raw body (hex-encoded, no prefix)
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Use timing-safe comparison
    return hmac.compare_digest(signature_header, expected_signature)


@app.post("/webhooks/fireflies")
async def fireflies_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature")

    # Verify webhook signature
    if not verify_fireflies_webhook(raw_body, signature_header, fireflies_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification
    payload = json.loads(raw_body)
    meeting_id = payload.get("meetingId")
    event_type = payload.get("eventType")
    client_reference_id = payload.get("clientReferenceId")

    print(f'Received "{event_type}" event for meeting {meeting_id}')

    # Handle the event based on its type (Fireflies puts the type in the body)
    if event_type == "Transcription completed":
        ref = f" (ref: {client_reference_id})" if client_reference_id else ""
        print(f"Transcript ready for meeting {meeting_id}{ref}")
        # TODO: Fetch the transcript from the Fireflies GraphQL API using
        # meeting_id, then sync notes, post to Slack, update your CRM, etc.
    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
