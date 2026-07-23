# Generated with: typeform-webhooks skill
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

typeform_secret = os.environ.get("TYPEFORM_WEBHOOK_SECRET")


def verify_typeform_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Typeform webhook signature.

    Typeform signs the raw request body with HMAC-SHA256 keyed on your webhook
    secret, base64-encodes it, and sends it in the ``Typeform-Signature`` header
    prefixed with ``sha256=``.
    """
    if not signature_header:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = "sha256=" + base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, signature_header)


@app.post("/webhooks/typeform")
async def typeform_webhook(request: Request):
    # Read the raw body for signature verification — do not parse first
    raw_body = await request.body()
    signature = request.headers.get("typeform-signature")

    # Verify webhook signature against the raw body
    if not verify_typeform_signature(raw_body, signature, typeform_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification succeeds
    event = json.loads(raw_body)
    event_id = event.get("event_id")
    event_type = event.get("event_type")
    form_response = event.get("form_response", {})

    print(f"Received {event_type} (event_id: {event_id})")

    # Handle the event based on its type
    if event_type == "form_response":
        print(f"Form submitted: {form_response.get('form_id')} token: {form_response.get('token')}")
        # TODO: Process the submission — sync to CRM, notify, fulfill, etc.

    elif event_type == "form_response_partial":
        print(f"Partial submission: {form_response.get('form_id')} token: {form_response.get('token')}")
        # TODO: Follow up on abandoned forms, track drop-off, etc.

    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge receipt quickly; do heavy work asynchronously
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
