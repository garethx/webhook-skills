# Generated with: twitch-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

twitch_secret = os.environ.get("TWITCH_WEBHOOK_SECRET", "")

# Twitch EventSub message types (Twitch-Eventsub-Message-Type header)
MESSAGE_TYPE_VERIFICATION = "webhook_callback_verification"
MESSAGE_TYPE_NOTIFICATION = "notification"
MESSAGE_TYPE_REVOCATION = "revocation"

# Reject messages whose timestamp is older than this (replay protection)
MAX_AGE_SECONDS = 10 * 60  # 10 minutes


def verify_twitch_signature(
    message_id: str,
    timestamp: str,
    raw_body: bytes,
    signature_header: str,
    secret: str,
) -> bool:
    """Verify a Twitch EventSub webhook signature.

    Twitch signs an HMAC-SHA256 over the concatenation of the message id, the
    message timestamp, and the RAW request body (in that order), sent in the
    Twitch-Eventsub-Message-Signature header as "sha256=<hex>".
    """
    if not (message_id and timestamp and signature_header):
        return False

    message = message_id.encode("utf-8") + timestamp.encode("utf-8") + raw_body
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"), message, hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(expected, signature_header)


def is_stale(timestamp: str) -> bool:
    """Return True if the message timestamp is older than the allowed window."""
    try:
        sent = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        return True
    age = abs((datetime.now(timezone.utc) - sent).total_seconds())
    return age > MAX_AGE_SECONDS


@app.post("/webhooks/twitch")
async def twitch_webhook(request: Request):
    # Read the RAW body for signature verification — do not parse first
    raw_body = await request.body()
    message_id = request.headers.get("twitch-eventsub-message-id")
    timestamp = request.headers.get("twitch-eventsub-message-timestamp")
    signature = request.headers.get("twitch-eventsub-message-signature")
    message_type = request.headers.get("twitch-eventsub-message-type")

    # 1. Verify the signature (applies to ALL message types)
    if not verify_twitch_signature(message_id, timestamp, raw_body, signature, twitch_secret):
        return Response(content="Invalid signature", status_code=403)

    # 2. Reject stale messages (replay protection)
    if is_stale(timestamp):
        return Response(content="Stale message", status_code=403)

    # Parse the payload only AFTER the signature is verified
    payload = json.loads(raw_body)

    # 3. Respond to the one-time verification challenge
    if message_type == MESSAGE_TYPE_VERIFICATION:
        print("Responding to webhook_callback_verification challenge")
        # Must return the raw challenge string as text/plain (not JSON-wrapped)
        return Response(content=payload["challenge"], media_type="text/plain")

    # 4. Handle subscription revocation
    if message_type == MESSAGE_TYPE_REVOCATION:
        subscription = payload["subscription"]
        print(f"Subscription {subscription['type']} revoked: {subscription['status']}")
        return Response(status_code=204)

    # 5. Handle notifications
    if message_type == MESSAGE_TYPE_NOTIFICATION:
        handle_event(payload["subscription"]["type"], payload["event"])
        return Response(status_code=204)

    print(f"Unknown message type: {message_type}")
    return Response(status_code=204)


def handle_event(subscription_type: str, event: dict) -> None:
    """Dispatch a Twitch EventSub notification by subscription type."""
    print(f"Received {subscription_type} notification")

    if subscription_type == "stream.online":
        print(f"{event['broadcaster_user_name']} went live ({event['type']})")
        # TODO: post "now live" alert, start recording, etc.

    elif subscription_type == "stream.offline":
        print(f"{event['broadcaster_user_name']} went offline")
        # TODO: post end-of-stream summary, stop recording, etc.

    elif subscription_type == "channel.follow":
        print(f"{event['user_name']} followed {event['broadcaster_user_name']}")
        # TODO: follower alert, welcome message, etc.

    elif subscription_type == "channel.update":
        print(f"{event['broadcaster_user_name']} updated: {event['title']} ({event['category_name']})")
        # TODO: refresh embeds, log category change, etc.

    elif subscription_type == "channel.subscribe":
        print(f"{event['user_name']} subscribed (tier {event['tier']})")
        # TODO: sub alert, loyalty rewards, etc.

    elif subscription_type == "channel.subscription.gift":
        print(f"{event['user_name']} gifted {event['total']} sub(s)")
        # TODO: gift-sub alert, leaderboard, etc.

    elif subscription_type == "channel.cheer":
        print(f"{event['user_name']} cheered {event['bits']} bits")
        # TODO: bits alert, goal tracking, etc.

    elif subscription_type == "channel.raid":
        print(f"{event['from_broadcaster_user_name']} raided with {event['viewers']} viewers")
        # TODO: raid alert, shoutout, etc.

    elif subscription_type == "channel.ban":
        print(f"{event['user_name']} was banned by {event['moderator_user_name']}")
        # TODO: moderation log, etc.

    elif subscription_type == "channel.channel_points_custom_reward_redemption.add":
        print(f"{event['user_name']} redeemed \"{event['reward']['title']}\"")
        # TODO: fulfill reward, queue actions, etc.

    else:
        print(f"Unhandled subscription type: {subscription_type}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
