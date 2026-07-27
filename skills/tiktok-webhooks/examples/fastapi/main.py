# Generated with: tiktok-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

tiktok_client_secret = os.environ.get("TIKTOK_CLIENT_SECRET")


def verify_tiktok_webhook(
    raw_body: bytes,
    header: str | None,
    client_secret: str | None,
    tolerance_sec: int = 300,
) -> bool:
    """Verify a TikTok for Developers webhook.

    TikTok has no webhook SDK. The ``TikTok-Signature`` header looks like::

        t=1633174587,s=<hex>

    signature = HMAC-SHA256(client_secret, "<t>.<raw_body>"), hex-encoded.
    Verify against the RAW body and reject stale timestamps (replay protection).
    """
    # No secret configured means we cannot verify anything — fail closed.
    if not header or not client_secret:
        return False

    # Header format: "t=<ts>,s=<hex>"
    parts = dict(kv.split("=", 1) for kv in header.split(",") if "=" in kv)
    t, s = parts.get("t"), parts.get("s")
    if not t or not s:
        return False

    # Reject stale timestamps. TikTok documents no explicit tolerance window;
    # 5 minutes is a sane default. Pair with idempotency to dedupe retries.
    try:
        age = abs(int(time.time()) - int(t))
    except ValueError:
        return False
    if age > tolerance_sec:
        return False

    signed = f"{t}.".encode("utf-8") + raw_body
    expected = hmac.new(
        client_secret.encode("utf-8"), signed, hashlib.sha256
    ).hexdigest()

    # Timing-safe compare.
    return hmac.compare_digest(expected, s)


@app.post("/webhooks/tiktok")
async def tiktok_webhook(request: Request):
    # Read the raw body — required for signature verification.
    raw_body = await request.body()
    signature = request.headers.get("tiktok-signature")

    # Verify before parsing.
    if not verify_tiktok_webhook(raw_body, signature, tiktok_client_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Safe to parse now that the signature checks out.
    payload = json.loads(raw_body)
    event = payload.get("event")
    user_openid = payload.get("user_openid")
    create_time = payload.get("create_time")

    # `content` is a serialized JSON string — parse it separately.
    try:
        content = json.loads(payload["content"]) if payload.get("content") else {}
    except (ValueError, KeyError):
        content = {}

    print(f"Received {event} for {user_openid or '(no openid)'} at {create_time}")

    # Delivery is at-least-once — dedupe on a stable key before doing real work.
    if event == "authorization.removed":
        # content.reason: 0 unknown, 1 user disconnect, 2 account deleted,
        # 3 age change, 4 account banned, 5 developer revoked.
        print(f"Authorization removed (reason {content.get('reason')})")
        # TODO: purge stored tokens for user_openid, stop syncing.
    elif event == "video.upload.failed":
        print(f"Video upload failed: {content.get('share_id')}")
        # TODO: surface the failure / retry.
    elif event == "video.publish.completed":
        print(f"Video published: {content.get('share_id')}")
        # TODO: mark the post live, record the published video.
    elif event == "portability.download.ready":
        print(f"Data export ready: request {content.get('request_id')}")
        # TODO: fetch the export, notify the requesting user.
    else:
        print(f"Unhandled event: {event}")

    # Acknowledge quickly (within TikTok's window) so it does not retry.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
