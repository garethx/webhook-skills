# Generated with: statsig-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()


def verify_statsig_request(
    raw_body: bytes,
    signature_header: str | None,
    timestamp_header: str | None,
    signing_secret: str | None,
) -> bool:
    """Verify an Event Webhook request from Statsig.

    Statsig signs ``v0:{timestamp}:{raw_body}`` with HMAC-SHA256 using the
    integration's signing secret and sends the result as
    ``X-Statsig-Signature: v0=<hex>``. The ``X-Statsig-Request-Timestamp`` header
    is a Unix timestamp in MILLISECONDS.
    """
    if not signature_header or not timestamp_header or not signing_secret:
        return False

    try:
        timestamp = int(timestamp_header)
    except ValueError:
        return False

    # Statsig's timestamp is in MILLISECONDS. Replay protection (best practice;
    # Statsig does not document a tolerance): reject requests more than 5 minutes
    # from now.
    if abs(time.time() * 1000 - timestamp) > 5 * 60 * 1000:
        return False

    # Statsig signs the literal string: "v0:" + timestamp + ":" + raw body
    basestring = f"v0:{timestamp_header}:{raw_body.decode('utf-8')}".encode("utf-8")
    expected = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        basestring,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature_header)


@app.post("/webhooks/statsig")
async def statsig_webhook(request: Request):
    raw_body = await request.body()
    signature_header = request.headers.get("x-statsig-signature")
    timestamp_header = request.headers.get("x-statsig-request-timestamp")
    signing_secret = os.environ.get("STATSIG_WEBHOOK_SECRET")

    if not verify_statsig_request(raw_body, signature_header, timestamp_header, signing_secret):
        return PlainTextResponse("Invalid signature", status_code=401)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return PlainTextResponse("Invalid JSON", status_code=400)

    # Statsig delivers batches. Config changes arrive as {"data": [...]};
    # exposure events arrive as a top-level JSON array.
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = payload.get("data") or []
    else:
        items = []

    for item in items:
        meta = item.get("metadata") or {}

        if meta.get("action"):
            # Config change — metadata: type / name / description / action
            print(f"Config change: {meta.get('type')} \"{meta.get('name')}\" was {meta.get('action')}")
            # TODO: sync config state, audit log, notify a channel
        else:
            # Exposure event
            user = item.get("user") or {}
            user_id = user.get("userID") if isinstance(user, dict) else user
            print(f"Exposure event: {item.get('eventName')} (user: {user_id})")
            # TODO: analytics, monitoring

    # Acknowledge quickly; process heavy work asynchronously
    return PlainTextResponse("OK", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
