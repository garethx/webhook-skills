# Generated with: discord-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, Request, Response
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

load_dotenv()

app = FastAPI(title="Discord Webhook Handler")


def verify_discord_signature(
    body: bytes,
    signature: str,
    timestamp: str,
    public_key: str,
) -> bool:
    """Verify a Discord webhook request using Ed25519.

    Signed content: ``timestamp + raw_body`` (byte concatenation).
    """
    try:
        verify_key = VerifyKey(bytes.fromhex(public_key))
        verify_key.verify(timestamp.encode() + body, bytes.fromhex(signature))
        return True
    except (BadSignatureError, ValueError):
        return False


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/discord")
async def discord_webhook(
    request: Request,
    x_signature_ed25519: Optional[str] = Header(None),
    x_signature_timestamp: Optional[str] = Header(None),
):
    public_key = os.environ.get("DISCORD_PUBLIC_KEY")
    if not public_key:
        print("DISCORD_PUBLIC_KEY is not configured")
        return Response(content="Server configuration error", status_code=500)

    if not x_signature_ed25519 or not x_signature_timestamp:
        return Response(content="Missing signature headers", status_code=401)

    body = await request.body()
    if not verify_discord_signature(body, x_signature_ed25519, x_signature_timestamp, public_key):
        return Response(content="Invalid request signature", status_code=401)

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON payload", status_code=400)

    payload_type = payload.get("type")

    # type 0 = PING (endpoint validation). Reply 204 with empty body.
    if payload_type == 0:
        print("Received Discord PING")
        return Response(status_code=204)

    # type 1 = webhook event
    if payload_type == 1:
        event = payload.get("event") or {}
        event_type = event.get("type")
        data = event.get("data") or {}
        print(f"Received Discord event: {event_type}")

        if event_type == "APPLICATION_AUTHORIZED":
            user = data.get("user") or {}
            print(f"App authorized for user: {user.get('id')}, scopes: {data.get('scopes')}")
        elif event_type == "APPLICATION_DEAUTHORIZED":
            user = data.get("user") or {}
            print(f"App deauthorized for user: {user.get('id')}")
        elif event_type == "ENTITLEMENT_CREATE":
            print(
                "Entitlement created: "
                f"id={data.get('id')} user_id={data.get('user_id')} sku_id={data.get('sku_id')}"
            )
        elif event_type == "ENTITLEMENT_UPDATE":
            print(f"Entitlement updated: id={data.get('id')}")
        elif event_type == "ENTITLEMENT_DELETE":
            print(f"Entitlement deleted: id={data.get('id')}")
        elif event_type == "QUEST_USER_ENROLLMENT":
            print(
                "Quest enrollment: "
                f"user_id={data.get('user_id')} quest_id={data.get('quest_id')}"
            )
        elif event_type == "LOBBY_MESSAGE_CREATE":
            print(
                "Lobby message: "
                f"lobby_id={data.get('lobby_id')} content={data.get('content')!r}"
            )
        elif event_type == "GAME_DIRECT_MESSAGE_CREATE":
            print(
                "Game DM: "
                f"channel_id={data.get('channel_id')} content={data.get('content')!r}"
            )
        else:
            print(f"Unhandled event type: {event_type}")

    # Acknowledge with 204 (no body). Any 2XX within 3s is accepted by Discord.
    return Response(status_code=204)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
