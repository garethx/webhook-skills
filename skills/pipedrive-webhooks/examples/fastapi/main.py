# Generated with: pipedrive-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

WEBHOOK_USER = os.environ.get("PIPEDRIVE_WEBHOOK_USER", "")
WEBHOOK_PASSWORD = os.environ.get("PIPEDRIVE_WEBHOOK_PASSWORD", "")


def verify_basic_auth(auth_header: str | None) -> bool:
    """Pipedrive does NOT sign webhooks (no HMAC, no signature header). It sends
    the credentials you configured (http_auth_user / http_auth_password) as HTTP
    Basic Auth on every delivery. Verify them with a constant-time comparison."""
    if not auth_header or not auth_header.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(auth_header[6:], validate=True).decode("utf-8")
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return False
    user, sep, password = decoded.partition(":")  # password may contain ":"
    if not sep:
        return False
    # compare_digest is constant-time; combine so both checks always run
    user_ok = hmac.compare_digest(user, WEBHOOK_USER)
    pass_ok = hmac.compare_digest(password, WEBHOOK_PASSWORD)
    return user_ok and pass_ok


@app.post("/webhooks/pipedrive")
async def pipedrive_webhook(request: Request):
    # 1. Authenticate the delivery
    if not verify_basic_auth(request.headers.get("authorization")):
        print("Pipedrive webhook authentication failed")
        return Response(content="Unauthorized", status_code=401)

    # 2. Parse and validate payload structure
    try:
        body = await request.json()
    except Exception:
        return Response(content="Invalid JSON", status_code=400)

    meta = body.get("meta") if isinstance(body, dict) else None
    if not meta or not meta.get("action") or not meta.get("entity"):
        return Response(content="Invalid payload structure", status_code=400)

    # 3. Build the v2 event type from meta.action + meta.entity
    event = f"{meta['action']}.{meta['entity']}"
    data = body.get("data") or {}
    previous = body.get("previous")
    print(f"Received {event} (correlation_id={meta.get('correlation_id')})")

    # 4. Dispatch on the event type
    if event == "create.deal":
        print(f"Deal created: {data.get('id')}")
        # TODO: sync new deal, notify sales, etc.
    elif event == "change.deal":
        print(f"Deal changed: {data.get('id')} changed fields: {previous}")
        # TODO: react to stage/value/owner changes
    elif event == "delete.deal":
        print(f"Deal deleted: {meta.get('entity_id')}")
        # TODO: remove records, audit trail
    elif event == "change.person":
        print(f"Person changed: {data.get('id')}")
        # TODO: keep contact records in sync
    elif event == "create.activity":
        print(f"Activity created: {data.get('id')}")
        # TODO: trigger reminders, calendar sync
    else:
        print(f"Unhandled event: {event}")

    # 5. Acknowledge quickly with any 2XX (do heavy work asynchronously)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
