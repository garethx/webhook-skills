# Generated with: sanity-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("SANITY_WEBHOOK_SECRET", "")

# Sanity signs with the `sanity-webhook-signature` header, Stripe-style:
#   t=<ms-timestamp>,v1=<signature>
SIGNATURE_HEADER = "sanity-webhook-signature"
_SIG_RE = re.compile(r"^t=(\d+)[, ]+v1=([^, ]+)$")


def is_valid_signature(raw_body: str, signature_header: str, secret: str) -> bool:
    """Verify a Sanity webhook signature.

    There is no official Python SDK, so this replicates @sanity/webhook:
    HMAC-SHA256 over `${timestamp}.${raw_body}` (timestamp in milliseconds),
    base64url-encoded with no padding, compared timing-safely against `v1`.
    """
    match = _SIG_RE.match(signature_header or "")
    if not match:
        return False

    timestamp, provided = match.group(1), match.group(2)
    signed_payload = f"{timestamp}.{raw_body}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).digest()
    expected = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")  # base64url, no padding
    return hmac.compare_digest(expected, provided)


@app.post("/webhooks/sanity")
async def sanity_webhook(request: Request):
    # Read the RAW body for signature verification (do not parse JSON first).
    raw_body = (await request.body()).decode("utf-8")
    signature = request.headers.get(SIGNATURE_HEADER)

    if not signature:
        raise HTTPException(status_code=400, detail="Missing sanity-webhook-signature header")

    if not is_valid_signature(raw_body, signature, webhook_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Safe to parse now that the payload is verified.
    try:
        doc = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Optional: deduplicate retries using the idempotency-key header.
    idempotency_key = request.headers.get("idempotency-key")

    # Sanity has no fixed event names — dispatch on the document `_type`
    # (from the default payload or your GROQ projection).
    doc_type = doc.get("_type")
    doc_id = doc.get("_id")

    if doc_type == "post":
        print(f"Post changed: {doc_id} (idempotency-key: {idempotency_key})")
        # TODO: Revalidate /blog/[slug], purge CDN cache, etc.
    elif doc_type == "author":
        print(f"Author changed: {doc_id}")
        # TODO: Revalidate author pages.
    elif doc_type == "product":
        print(f"Product changed: {doc_id}")
        # TODO: Revalidate storefront, reindex search, etc.
    elif doc_type == "category":
        print(f"Category changed: {doc_id}")
        # TODO: Rebuild navigation, revalidate listings.
    elif doc_type == "page":
        print(f"Page changed: {doc_id}")
        # TODO: Revalidate the page route.
    else:
        print(f"Unhandled document type: {doc_type}")

    # Return 200 to acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
