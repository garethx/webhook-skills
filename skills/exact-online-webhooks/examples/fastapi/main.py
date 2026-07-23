# Generated with: exact-online-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

exact_secret = os.environ.get("EXACT_WEBHOOK_SECRET")


def verify_exact_webhook(raw_body: bytes, secret: str) -> bool:
    """Verify an Exact Online webhook.

    Exact does NOT use Standard Webhooks and sends no signature header. The
    signature is the ``HashCode`` field inside the JSON body:

        {"Content":{...},"HashCode":"<UPPERCASE HEX>"}

    HashCode = HMAC-SHA256(secret, <raw JSON of the Content node>), hex, uppercased.
    We hash the exact raw substring of Content, not a re-serialized object.
    """
    if not secret:
        return False

    raw = raw_body.decode("utf-8")
    prefix, marker = '{"Content":', ',"HashCode":'
    start = raw.find(prefix)
    end = raw.rfind(marker)  # HashCode is last, so use rfind
    if start == -1 or end == -1 or end < start:
        return False

    # Exact bytes Exact signed — do NOT re-serialize the parsed Content object.
    content_json = raw[start + len(prefix):end]

    try:
        hash_code = json.loads(raw)["HashCode"]
    except (ValueError, KeyError):
        return False
    if not hash_code:
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        content_json.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest().upper()

    # Timing-safe compare; uppercase both sides so hex casing never trips us up.
    return hmac.compare_digest(expected, str(hash_code).upper())


@app.post("/webhooks/exact-online")
async def exact_webhook(request: Request):
    # Read the raw body — required for signature verification.
    raw_body = await request.body()

    # Verify before parsing.
    if not verify_exact_webhook(raw_body, exact_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Safe to parse now that the HashCode checks out.
    content = json.loads(raw_body)["Content"]
    topic = content["Topic"]
    action = content["Action"]
    key = content["Key"]
    division = content["Division"]

    print(f"Received {topic} {action} for {key} (division {division})")

    # The payload is thin — fetch the full record from the REST API using key +
    # division (skip on Delete). Return 200 quickly; do slow work asynchronously.
    if topic == "Accounts":
        pass  # TODO: GET /api/v1/{division}/crm/Accounts?$filter=ID eq guid'{key}'
    elif topic == "Items":
        pass  # TODO: GET /api/v1/{division}/logistics/Items?$filter=ID eq guid'{key}'
    elif topic == "StockPositions":
        pass  # TODO: sync inventory / reorder alerts
    elif topic == "FinancialTransactions":
        pass  # TODO: reconciliation / reporting
    elif topic == "GoodsDeliveries":
        pass  # TODO: fulfilment / shipping
    elif topic == "Contacts":
        pass  # TODO: CRM sync
    else:
        print(f"Unhandled topic: {topic}")

    # Acknowledge quickly so Exact does not retry.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
