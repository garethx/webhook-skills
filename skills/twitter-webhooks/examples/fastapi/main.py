# Generated with: twitter-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()


def build_signature(message: bytes, consumer_secret: str) -> str:
    """Build an X/Twitter signature value.

    ``sha256=`` + base64(HMAC-SHA256(consumer_secret, message)). This same
    primitive produces the CRC ``response_token`` (message = crc_token) and the
    expected ``x-twitter-webhooks-signature`` for POST events (message = raw body).
    """
    digest = hmac.new(consumer_secret.encode("utf-8"), message, hashlib.sha256).digest()
    return "sha256=" + base64.b64encode(digest).decode("utf-8")


def verify_twitter_signature(
    raw_body: bytes,
    signature_header: str | None,
    consumer_secret: str | None,
) -> bool:
    """Verify the x-twitter-webhooks-signature header against the raw body."""
    if not signature_header or not consumer_secret:
        return False
    expected = build_signature(raw_body, consumer_secret)
    return hmac.compare_digest(expected, signature_header)


# CRC (Challenge-Response Check): X sends GET ?crc_token=... at registration,
# roughly hourly, and on demand. Reply with the response_token or X marks the
# webhook invalid and stops delivering events.
@app.get("/webhooks/twitter")
async def twitter_crc(request: Request):
    crc_token = request.query_params.get("crc_token")
    consumer_secret = os.environ.get("TWITTER_CONSUMER_SECRET")

    if not crc_token:
        return PlainTextResponse("Missing crc_token", status_code=400)
    if not consumer_secret:
        return PlainTextResponse(
            "Server misconfigured: TWITTER_CONSUMER_SECRET not set", status_code=500
        )

    return JSONResponse(
        {"response_token": build_signature(crc_token.encode("utf-8"), consumer_secret)}
    )


@app.post("/webhooks/twitter")
async def twitter_webhook(request: Request):
    raw_body = await request.body()
    signature_header = request.headers.get("x-twitter-webhooks-signature")
    consumer_secret = os.environ.get("TWITTER_CONSUMER_SECRET")

    if not verify_twitter_signature(raw_body, signature_header, consumer_secret):
        print("Twitter signature verification failed")
        return PlainTextResponse("Invalid signature", status_code=400)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return PlainTextResponse("Invalid JSON", status_code=400)

    # The same endpoint receives every event type — dispatch on the event key
    # present in the payload. ``for_user_id`` names the subscribed user.
    for_user = payload.get("for_user_id")

    if "tweet_create_events" in payload:
        print(f"tweet_create_events for {for_user}: {len(payload['tweet_create_events'])} tweet(s)")
        # TODO: Process new Posts, mentions, replies, quotes
    elif "tweet_delete_events" in payload:
        print(f"tweet_delete_events for {for_user}")
        # TODO: Handle deletion compliance notices
    elif "favorite_events" in payload:
        print(f"favorite_events for {for_user}: {len(payload['favorite_events'])} like(s)")
        # TODO: Handle likes
    elif "follow_events" in payload:
        event = (payload["follow_events"] or [{}])[0]
        print(f"follow_events for {for_user}: {event.get('type')}")  # follow | unfollow
        # TODO: Handle follow / unfollow
    elif "block_events" in payload:
        event = (payload["block_events"] or [{}])[0]
        print(f"block_events for {for_user}: {event.get('type')}")  # block | unblock
        # TODO: Handle block / unblock
    elif "mute_events" in payload:
        event = (payload["mute_events"] or [{}])[0]
        print(f"mute_events for {for_user}: {event.get('type')}")  # mute | unmute
        # TODO: Handle mute / unmute
    elif "direct_message_events" in payload:
        print(f"direct_message_events for {for_user}: {len(payload['direct_message_events'])} message(s)")
        # TODO: Handle direct messages
    elif "direct_message_indicate_typing_events" in payload:
        print(f"direct_message_indicate_typing_events for {for_user}")
    elif "direct_message_mark_read_events" in payload:
        print(f"direct_message_mark_read_events for {for_user}")
    elif "user_event" in payload:
        print("user_event: authorization revoked")
        # TODO: Clean up the revoked user's subscription/state
    else:
        print(f"Unhandled event payload keys: {', '.join(payload.keys())}")

    # Acknowledge within 10 seconds. Delivery is at-most-once (no documented
    # retries), so process idempotently.
    return PlainTextResponse("OK", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
