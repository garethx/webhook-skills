# Generated with: quoter-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

MAX_AGE_SECONDS = 300  # reject requests older than 5 minutes


def verify_quoter(hash_key: str, timestamp: str, data: str, received_hash: str) -> bool:
    """Verify a Quoter webhook.

    Quoter POSTs application/x-www-form-urlencoded with three fields:
        hash, timestamp, data
    The `hash` is md5(HASH_KEY + timestamp + data), where `data` is the raw
    JSON/XML string exactly as sent. NOTE: this is a weak MD5 scheme, NOT
    HMAC-SHA256 and NOT Standard Webhooks. Always configure a hash key.
    """
    if not hash_key or not timestamp or not data or not received_hash:
        return False

    # Reject stale requests (timestamp is GMT UNIX seconds)
    try:
        age = abs(int(time.time()) - int(timestamp))
    except ValueError:
        return False
    if age > MAX_AGE_SECONDS:
        return False

    # Hash the `data` string exactly as received — never re-serialize it.
    expected = hashlib.md5(f"{hash_key}{timestamp}{data}".encode("utf-8")).hexdigest()
    return hmac.compare_digest(expected, received_hash)


@app.post("/webhooks/quoter")
async def quoter_webhook(request: Request):
    # Quoter sends form-urlencoded, so read the form fields (not JSON).
    form = await request.form()
    received_hash = form.get("hash")
    timestamp = form.get("timestamp")
    data = form.get("data")

    if not received_hash or not timestamp or not data:
        raise HTTPException(status_code=400, detail="Missing hash, timestamp, or data")

    hash_key = os.environ.get("QUOTER_HASH_KEY")
    if not verify_quoter(hash_key, timestamp, data, received_hash):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Verified — now it's safe to parse the payload string.
    try:
        payload = json.loads(data)  # use an XML parser if you chose XML format
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in data field")

    # Quoter has no dotted event names and the request doesn't identify the
    # object type, so we read it from the ?object= query parameter (configure a
    # distinct target URL per object type, e.g. /webhooks/quoter?object=quote).
    # Each object type fires on both create and update; there's no documented
    # field to tell them apart, so process idempotently keyed on payload["id"].
    object_type = request.query_params.get("object", "unknown")
    object_id = payload.get("id", "(no id)")

    if object_type == "quote":
        print(f"Quote received: {object_id}")
        # TODO: sync the quote (e.g. trigger fulfillment when accepted).
    elif object_type == "person":
        print(f"Person received: {object_id}")
        # TODO: sync the contact to your CRM.
    elif object_type == "payment":
        print(f"Payment received: {object_id}")
        # TODO: reconcile the payment.
    else:
        print(f"Quoter object received (unknown type): {object_id}")

    # Acknowledge quickly with a 2xx.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
