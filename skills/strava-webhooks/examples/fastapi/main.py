# Generated with: strava-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()

VERIFY_TOKEN = os.environ.get("STRAVA_VERIFY_TOKEN", "")
SUBSCRIPTION_ID = os.environ.get("STRAVA_SUBSCRIPTION_ID")  # optional


def token_matches(received: str, expected: str) -> bool:
    """Constant-time comparison of the verify token from the validation handshake."""
    return hmac.compare_digest(received or "", expected or "")


@app.get("/webhooks/strava")
async def validate_subscription(
    # Strava sends dotted query params: hub.mode / hub.verify_token / hub.challenge
    hub_mode: str = Query(default="", alias="hub.mode"),
    hub_verify_token: str = Query(default="", alias="hub.verify_token"),
    hub_challenge: str = Query(default="", alias="hub.challenge"),
):
    """Subscription validation handshake.

    Strava sends GET /webhooks/strava?hub.mode=subscribe
      &hub.verify_token=<your token>&hub.challenge=<random>
    Respond 200 with {"hub.challenge": "<echoed value>"} within 2 seconds.
    """
    if hub_mode == "subscribe" and token_matches(hub_verify_token, VERIFY_TOKEN):
        # The response key must be the literal string "hub.challenge" (with the dot).
        return JSONResponse(content={"hub.challenge": hub_challenge})

    return PlainTextResponse("Forbidden", status_code=403)


@app.post("/webhooks/strava")
async def receive_event(request: Request):
    """Event delivery.

    Strava events are NOT signed — trust is established by the validation
    handshake and (optionally) by checking the subscription_id.
    """
    event = await request.json()

    # Optional: reject events that aren't from our subscription.
    if SUBSCRIPTION_ID and str(event.get("subscription_id")) != str(SUBSCRIPTION_ID):
        return PlainTextResponse("Unknown subscription", status_code=403)

    # Dispatch by object_type + aspect_type (there is no single event-name field).
    object_type = event.get("object_type")
    aspect_type = event.get("aspect_type")
    object_id = event.get("object_id")
    owner_id = event.get("owner_id")
    updates = event.get("updates") or {}

    key = f"{object_type}:{aspect_type}"

    if key == "activity:create":
        print(f"Activity created: {object_id} (athlete {owner_id})")
        # TODO: fetch the activity from the Strava REST API using object_id.
    elif key == "activity:update":
        print(f"Activity updated: {object_id} {updates}")
        # TODO: re-sync cached activity metadata (title/type/private).
    elif key == "activity:delete":
        print(f"Activity deleted: {object_id}")
        # TODO: remove the activity from your store.
    elif key == "athlete:update":
        if updates.get("authorized") == "false":
            print(f"Athlete {owner_id} deauthorized the app")
            # TODO: revoke tokens and stop syncing this athlete.
        else:
            print(f"Athlete {owner_id} updated {updates}")
    else:
        print(f"Unhandled event: {key}")

    # Acknowledge receipt (Strava expects a 200 within 2 seconds).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
