# Generated with: microsoft-sharepoint-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI()

CLIENT_STATE = os.environ.get("SHAREPOINT_CLIENT_STATE", "")

# ChangeType values returned by the list GetChanges API. The notification itself
# carries no change details -- these describe what you find once you call it.
CHANGE_TYPES = {
    "Add": "ItemAdded",
    "Update": "ItemUpdated",
    "DeleteObject": "ItemDeleted",
    "Rename": "ItemRenamed",
    "Restore": "ItemRestored",
    "MoveAway": "ItemMovedOut",
    "MoveInto": "ItemMovedInto",
}


def client_state_matches(received, expected: str) -> bool:
    """Timing-safe compare of the clientState shared secret."""
    if not isinstance(received, str) or not isinstance(expected, str):
        return False
    return hmac.compare_digest(received, expected)


@app.post("/webhooks/microsoft-sharepoint")
async def sharepoint_webhook(request: Request):
    # 1. Validation handshake -- echo the validationtoken back as text/plain.
    #    Must happen before body parsing and within ~5 seconds, or the
    #    subscription is never created.
    validation_token = request.query_params.get("validationtoken")
    if validation_token is not None:
        return PlainTextResponse(validation_token, status_code=200)

    # 2. Parse the thin, batched notification payload.
    raw = await request.body()
    if not raw:
        notifications = []
    else:
        try:
            import json

            parsed = json.loads(raw)
            notifications = parsed.get("value", []) if isinstance(parsed, dict) else []
        except (ValueError, AttributeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")

    # 3. Validate the clientState shared secret on every notification.
    all_valid = all(
        client_state_matches(n.get("clientState"), CLIENT_STATE) for n in notifications
    )
    if not all_valid:
        raise HTTPException(status_code=400, detail="Invalid clientState")

    # 4. Acknowledge quickly, then process asynchronously. SharePoint retries 5x
    #    at 5-minute intervals on any non-2xx response or timeout.
    for n in notifications:
        print(
            f"Change in list {n.get('resource')} "
            f"(subscription {n.get('subscriptionId')}, site {n.get('siteUrl')})"
        )
        # TODO: enqueue GetChanges for list n["resource"] using your stored change
        # token, then map each change via CHANGE_TYPES and persist the new token.

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
