# Generated with: zerohash-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("ZEROHASH_WEBHOOK_SECRET", "")

# Reject timestamps older/newer than this to guard against replay attacks.
TOLERANCE_MS = 5 * 60 * 1000  # ±5 minutes


def to_millis(timestamp: str):
    """Normalize x-zh-hook-timestamp to milliseconds.

    Zero Hash documents the ±5 minute replay window but NOT whether the
    timestamp is in seconds or milliseconds. Assuming the wrong unit rejects
    every delivery, so detect it from the magnitude: a ~10-digit value is
    seconds, a ~13-digit value is already milliseconds. Only the staleness check
    needs this - the HMAC always covers the timestamp string as received.

    Returns None if the value is not an integer.
    """
    try:
        value = int(timestamp)
    except ValueError:
        return None
    return value * 1000 if abs(value) < 100_000_000_000 else value


def verify_zerohash(raw_body: bytes, headers, secret: str) -> bool:
    """Verify a Zero Hash webhook signature.

    Zero Hash has no webhook SDK, so we verify manually. It signs the RAW
    request body with HMAC-SHA256 and sends a HEX digest. Two schemes exist:

    - Recommended: `x-zh-hook-signature` = to_hex(hmac_sha256(payload + timestamp, secret))
      with `x-zh-hook-timestamp`. Reject stale timestamps.
    - Legacy: `x-zh-hook-signature-256` = to_hex(hmac_sha256(payload, secret)).

    `payload + timestamp` is a plain concatenation with NO delimiter.
    """
    signature = headers.get("x-zh-hook-signature")
    timestamp = headers.get("x-zh-hook-timestamp")

    if signature and timestamp:
        # Replay guard: accept a seconds or milliseconds timestamp (unit undocumented).
        timestamp_ms = to_millis(timestamp)
        if timestamp_ms is None:
            return False
        if abs(int(time.time() * 1000) - timestamp_ms) > TOLERANCE_MS:
            return False
        signed = raw_body + timestamp.encode("utf-8")
        expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    # Fall back to the legacy scheme (payload only, no timestamp).
    # NOTE: the legacy scheme has NO replay window - a captured request stays
    # valid forever. If your Zero Hash rep has put you on the new
    # x-zh-hook-signature + x-zh-hook-timestamp scheme, DELETE this branch.
    legacy = headers.get("x-zh-hook-signature-256")
    if legacy:
        expected = hmac.new(
            secret.encode("utf-8"), raw_body, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, legacy)

    return False


@app.post("/webhooks/zerohash")
async def zerohash_webhook(request: Request):
    # Read the RAW body for signature verification (do not parse JSON first).
    raw_body = await request.body()

    if not request.headers.get("x-zh-hook-signature") and not request.headers.get(
        "x-zh-hook-signature-256"
    ):
        raise HTTPException(
            status_code=400, detail="Missing Zero Hash signature header"
        )

    if not verify_zerohash(raw_body, request.headers, webhook_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Signature verified - safe to parse. The event type is in a header.
    # Zero Hash's docs are inconsistent about the exact payload-type strings
    # (underscore vs dot forms) - confirm them with your Zero Hash rep and let
    # the else branch log anything unexpected.
    payload_type = request.headers.get("x-zh-hook-payload-type")
    # Unconfirmed header - .get() returns None when absent, so fall back to an
    # id in the body or a hash of the payload for idempotency.
    notification_id = request.headers.get("x-zh-hook-notification-id")  # noqa: F841
    data = json.loads(raw_body)

    # TODO: use notification_id (when present) to deduplicate (idempotency).
    if payload_type == "trade_status_changed":
        print(f"Trade {data['trade_id']} status: {data['status']}")
        # TODO: update order/settlement state (accepted | active | terminated).

    elif payload_type == "payment_status_changed":
        print(f"Payment {data.get('payment_id')} status: {data.get('status')}")
        # TODO: update payment state. The payload shape is not documented -
        # log a real delivery before branching on specific status values.

    # Balance event name is unconfirmed - Zero Hash's docs show a dot form, so
    # accept the underscore spelling too.
    elif payload_type in ("account_balance.changed", "account_balance_changed"):
        print(
            f"Balance changed: {data['asset']} {data['account_type']} = {data['balance']}"
        )
        # TODO: reconcile available/collateral balances.

    else:
        print(f"Unhandled payload type: {payload_type}")

    # Return 200 to acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
