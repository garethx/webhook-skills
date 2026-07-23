# Generated with: monday-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
import jwt

load_dotenv()

app = FastAPI()

signing_secret = os.environ.get("MONDAY_SIGNING_SECRET")
webhook_url = os.environ.get("MONDAY_WEBHOOK_URL")


def verify_monday_jwt(auth_header: str | None, secret: str) -> dict:
    """
    Verify the JWT monday.com sends in the Authorization header.

    monday.com signs each request with a JWT (HS256) using your app's Signing
    Secret (board webhooks) or Client Secret (app lifecycle webhooks). The JWT is
    self-contained — it authenticates the sender but is NOT an HMAC over the body,
    so parsing JSON before this call is safe. Raises jwt.InvalidTokenError on a bad
    signature or an expired token.

    Set MONDAY_WEBHOOK_URL to also enforce the `aud` (audience) claim in production.
    """
    if not auth_header:
        raise jwt.InvalidTokenError("Missing Authorization header")
    # monday.com usually sends the raw token, no "Bearer " prefix.
    token = auth_header[7:] if auth_header.startswith("Bearer ") else auth_header

    options = {}
    audience = None
    if webhook_url:
        audience = webhook_url
    else:
        # No audience configured — skip the aud check so tunnel URLs work.
        options["verify_aud"] = False

    return jwt.decode(
        token,
        secret,
        algorithms=["HS256"],
        audience=audience,
        options=options,
    )


@app.post("/webhooks/monday")
async def monday_webhook(request: Request):
    # JSON body parsing is fine here — the JWT signature does not cover the body.
    body = await request.json()

    # 1. Challenge handshake — sent when the webhook is first registered. Echo the
    #    token back BEFORE any JWT check: challenge requests may not carry an
    #    Authorization header.
    if isinstance(body, dict) and isinstance(body.get("challenge"), str):
        return JSONResponse({"challenge": body["challenge"]})

    # 2. Verify the JWT when a Signing Secret is configured (integration-app
    #    webhooks). No-code / personal-token webhooks may not send a JWT — see
    #    ../../references/verification.md for how to secure those.
    if signing_secret:
        try:
            verify_monday_jwt(request.headers.get("authorization"), signing_secret)
        except jwt.InvalidTokenError as e:
            print(f"JWT verification failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid signature")

    # 3. Handle the event. Real events wrap their data in an `event` object.
    event = body.get("event", {}) if isinstance(body, dict) else {}
    event_type = event.get("type")

    if event_type == "create_item":
        print(f"Item created: {event.get('pulseId')} {event.get('pulseName')}")
        # TODO: Sync the new item to external systems

    elif event_type == "change_column_value":
        print(f"Column changed: {event.get('pulseId')} {event.get('columnId')}")
        # TODO: Mirror the column value to an external record

    elif event_type == "change_status_column_value":
        label = (event.get("value") or {}).get("label", {}).get("text")
        print(f"Status changed: {event.get('pulseId')} {label}")
        # TODO: Kick off a workflow when status reaches "Done", etc.

    elif event_type == "change_name":
        print(f"Item renamed: {event.get('pulseId')} {event.get('pulseName')}")
        # TODO: Keep external titles in sync

    elif event_type == "create_update":
        print(f"Update posted on item: {event.get('pulseId')}")
        # TODO: Notify Slack, log activity, etc.

    elif event_type == "create_subitem":
        print(f"Subitem created: {event.get('pulseId')} parent: {event.get('parentItemId')}")
        # TODO: Track sub-task creation

    elif event_type == "item_archived":
        print(f"Item archived: {event.get('pulseId')}")
        # TODO: Soft-delete the downstream record

    elif event_type == "item_deleted":
        print(f"Item deleted: {event.get('pulseId')}")
        # TODO: Clean up external records

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 quickly to acknowledge receipt. monday.com retries once a minute
    # for 30 minutes on non-2xx responses.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
