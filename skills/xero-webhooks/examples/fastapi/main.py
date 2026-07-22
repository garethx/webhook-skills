# Generated with: xero-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import base64
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

XERO_WEBHOOK_KEY = os.environ.get("XERO_WEBHOOK_KEY", "")


def verify_xero_signature(raw_body: bytes, signature_header: str, signing_key: str) -> bool:
    """Verify a Xero webhook signature.

    Xero computes HMAC-SHA256 over the RAW request body using the app's webhook
    signing key, base64-encodes it, and sends it in the `x-xero-signature` header.
    The official SDK does not provide a webhook helper, so verify manually.
    """
    if not signature_header:
        return False
    expected = base64.b64encode(
        hmac.new(signing_key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(signature_header, expected)


def handle_event(event: dict) -> None:
    """Handle a single Xero event.

    Payloads are thin: fetch the resource from ``event["resourceUrl"]``
    (authenticated with an OAuth2 token + ``Xero-tenant-id``) to get the full
    record. Dedupe on resourceId + eventDateUtc for idempotency.
    """
    key = f"{event.get('eventCategory')}/{event.get('eventType')}"
    resource_id = event.get("resourceId")

    if key == "CONTACT/CREATE":
        print(f"New contact: {resource_id}")
        # TODO: fetch resourceUrl, sync new contact to your CRM
    elif key == "CONTACT/UPDATE":
        print(f"Contact updated: {resource_id}")
        # TODO: fetch resourceUrl, update local contact record
    elif key == "INVOICE/CREATE":
        print(f"New invoice: {resource_id}")
        # TODO: fetch resourceUrl, record receivable/payable
    elif key == "INVOICE/UPDATE":
        print(f"Invoice updated: {resource_id}")
        # TODO: fetch resourceUrl, reconcile payment/status change
    elif key == "CREDITNOTE/CREATE":
        print(f"New credit note: {resource_id}")
        # TODO: fetch resourceUrl, track refund/adjustment
    elif key == "CREDITNOTE/UPDATE":
        print(f"Credit note updated: {resource_id}")
        # TODO: fetch resourceUrl, update refund/adjustment
    elif key == "SUBSCRIPTION/CREATE":
        print(f"New subscription: {resource_id}")
        # TODO: provision access for new app-store subscription
    elif key == "SUBSCRIPTION/UPDATE":
        print(f"Subscription updated: {resource_id}")
        # TODO: handle upgrade/cancellation/renewal
    else:
        print(f"Unhandled event: {key} ({resource_id})")


@app.post("/webhooks/xero")
async def xero_webhook(request: Request):
    # Read the RAW body for signature verification (do NOT parse first).
    raw_body = await request.body()
    signature = request.headers.get("x-xero-signature")

    # Verify first. Xero's Intent to Receive (ITR) requires 200 for a valid
    # signature and 401 for an invalid one. Return 401 (NOT 400) for a bad
    # signature or ITR will fail and the webhook will stay inactive.
    if not verify_xero_signature(raw_body, signature, XERO_WEBHOOK_KEY):
        print("Xero signature verification failed")
        return Response(content="Unauthorized", status_code=401)

    # Valid signature. Parse and dispatch real events; empty ITR probes just 200.
    try:
        payload = json.loads(raw_body)
    except (ValueError, json.JSONDecodeError):
        # Valid signature but unparseable body (e.g. an empty ITR probe): still 200.
        return Response(content="OK", status_code=200)

    for event in payload.get("events", []):
        handle_event(event)

    # Respond fast; do heavy work (resource fetches) asynchronously.
    return Response(content="OK", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
