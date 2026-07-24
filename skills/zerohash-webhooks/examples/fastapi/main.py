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


def verify_zerohash(raw_body: bytes, headers, secret: str) -> bool:
    """Verify a Zero Hash webhook signature.

    Zero Hash has no webhook SDK, so we verify manually. It signs the RAW
    request body with HMAC-SHA256 and sends a HEX digest. Two schemes exist:

    - Recommended: `x-zh-hook-signature` = to_hex(hmac_sha256(payload + timestamp, secret))
      with `x-zh-hook-timestamp` (UNIX milliseconds). Reject stale timestamps.
    - Legacy: `x-zh-hook-signature-256` = to_hex(hmac_sha256(payload, secret)).

    `payload + timestamp` is a plain concatenation with NO delimiter.
    """
    signature = headers.get("x-zh-hook-signature")
    timestamp = headers.get("x-zh-hook-timestamp")

    if signature and timestamp:
        # Replay guard: x-zh-hook-timestamp is UNIX milliseconds.
        try:
            if abs(int(time.time() * 1000) - int(timestamp)) > TOLERANCE_MS:
                return False
        except ValueError:
            return False
        signed = raw_body + timestamp.encode("utf-8")
        expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    # Fall back to the legacy scheme (payload only, no timestamp).
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
    payload_type = request.headers.get("x-zh-hook-payload-type")
    notification_id = request.headers.get("x-zh-hook-notification-id")  # noqa: F841
    data = json.loads(raw_body)

    # TODO: use notification_id to deduplicate (idempotency).
    if payload_type == "trade_status_changed":
        print(f"Trade {data['trade_id']} status: {data['status']}")
        # TODO: update order/settlement state (accepted | active | terminated).

    elif payload_type == "account_balance.changed":
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
