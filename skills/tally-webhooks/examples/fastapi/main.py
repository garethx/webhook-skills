# Generated with: tally-webhooks skill
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


def verify_tally_webhook(raw_body: bytes, signature_header: str | None, signing_secret: str) -> bool:
    """Verify a Tally webhook signature.

    Tally signs the raw JSON body with HMAC-SHA256 keyed on the webhook's signing
    secret, and sends the digest as base64 in the ``Tally-Signature`` header.
    """
    if not signature_header:
        return False
    expected = base64.b64encode(
        hmac.new(signing_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(signature_header, expected)


def get_answer(fields, label):
    """Look up an answer in data.fields by its label (order-independent)."""
    for field in fields or []:
        if field.get("label") == label:
            return field.get("value")
    return None


@app.post("/webhooks/tally")
async def tally_webhook(request: Request):
    # Read the raw body BEFORE parsing — signature is over the exact bytes.
    raw_body = await request.body()
    signature = request.headers.get("tally-signature")
    signing_secret = os.environ.get("TALLY_SIGNING_SECRET")

    # Signing is optional in Tally. If a secret is configured, require and verify
    # the signature. Otherwise the request is unsigned — process with a warning.
    if signing_secret:
        if not verify_tally_webhook(raw_body, signature, signing_secret):
            raise HTTPException(status_code=400, detail="Invalid signature")
    else:
        print(
            "TALLY_SIGNING_SECRET not set — skipping verification. Set a signing "
            "secret in the form Integrations tab for production endpoints."
        )

    payload = json.loads(raw_body)
    event_type = payload.get("eventType")
    data = payload.get("data", {})

    if event_type == "FORM_RESPONSE":
        print(
            f"FORM_RESPONSE {payload.get('eventId')} for form "
            f"\"{data.get('formName')}\" ({data.get('formId')})"
        )
        email = get_answer(data.get("fields"), "Email")
        if email:
            print(f"Email answer: {email}")
        # TODO: persist submission, sync to CRM, notify, etc.
        # Use eventId or data.submissionId as an idempotency key.
    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge receipt within Tally's 10s timeout.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
