# Generated with: ringcentral-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Response

load_dotenv()

app = FastAPI()

# Optional shared secret. Set the same value as `verificationToken` when creating
# the subscription. If unset, the Verification-Token check is skipped.
EXPECTED_TOKEN = os.environ.get("RINGCENTRAL_VERIFICATION_TOKEN")


def token_matches(received: str, expected: str) -> bool:
    """Timing-safe comparison for the Verification-Token header."""
    return hmac.compare_digest(received or "", expected or "")


def event_category(event_filter: str) -> str:
    """Map a RingCentral event filter (the `event` field) to a category.

    The filter is a resource path containing concrete IDs, so match by substring.
    """
    if not event_filter:
        return "unknown"
    if "/message-store/instant" in event_filter:
        return "instant-message"
    if "/message-store" in event_filter:
        return "message-store"
    if "/presence" in event_filter:
        return "presence"
    if "/telephony/sessions" in event_filter:
        return "telephony-session"
    if "/extension" in event_filter:
        return "extension"
    return "other"


@app.post("/webhooks/ringcentral")
async def ringcentral_webhook(request: Request):
    # 1. Validation-Token handshake (subscription create/renew).
    #    Echo the token back in the response header and return 200 fast.
    validation_token = request.headers.get("Validation-Token")
    if validation_token:
        return Response(
            content='{"status":"ok"}',
            media_type="application/json",
            headers={"Validation-Token": validation_token},
        )

    # 2. Verification-Token check (optional per-notification authenticity).
    if EXPECTED_TOKEN and not token_matches(
        request.headers.get("Verification-Token"), EXPECTED_TOKEN
    ):
        raise HTTPException(status_code=401, detail="Invalid verification token")

    # 3. Parse and dispatch.
    raw_body = await request.body()
    payload = json.loads(raw_body) if raw_body else {}
    event_filter = payload.get("event")
    category = event_category(event_filter)

    print(
        f"Received notification for {event_filter} "
        f"(subscription {payload.get('subscriptionId')})"
    )

    if category == "instant-message":
        print(f"Inbound instant message (SMS): {payload.get('body')}")
        # TODO: Reply to SMS, route to an agent, etc.

    elif category == "message-store":
        body = payload.get("body", {})
        print(f"Message store change: {body.get('changes')}")
        # TODO: Fetch the new message, log voicemail/fax, etc.

    elif category == "presence":
        print(f"Presence change for extension {payload.get('ownerId')}")
        # TODO: Update agent availability, dashboards, etc.

    elif category == "telephony-session":
        print(f"Telephony session event: {payload.get('body')}")
        # TODO: Screen-pop, call logging, analytics, etc.

    elif category == "extension":
        print(f"Extension change: {payload.get('body')}")
        # TODO: Sync provisioning, update directory, etc.

    else:
        print(f"Unhandled event filter: {event_filter}")

    # 4. Acknowledge fast — respond within a few seconds or risk blacklisting.
    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
