# Generated with: enode-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

enode_secret = os.environ.get("ENODE_WEBHOOK_SECRET")


def verify_enode_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify an Enode webhook signature.

    Enode signs the RAW request body with HMAC-SHA1 keyed on the per-webhook
    secret you generated, and sends it in the `x-enode-signature` header
    formatted as `sha1=<hex>`.
    """
    # Header format: sha1=<hex>
    algo, _, sig = (signature_header or "").partition("=")
    if algo != "sha1" or not sig:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(sig, expected)


def handle_enode_event(evt: dict) -> None:
    """Dispatch a single Enode event.

    The webhook body is an ARRAY of events, so this is called once per element.
    """
    event = evt.get("event")

    if event == "enode:webhook:test":
        print("Test webhook received — receiver is reachable")

    elif event == "system:heartbeat":
        print(f"Heartbeat received at {evt.get('createdAt')}")

    elif event == "user:vehicle:updated":
        user = evt.get("user", {})
        vehicle = evt.get("vehicle", {})
        print(f"Vehicle updated for user {user.get('id')}: {vehicle.get('id')}")
        # TODO: Sync charge state, battery level, location, etc.

    elif event == "user:vehicle:discovered":
        user = evt.get("user", {})
        vehicle = evt.get("vehicle", {})
        print(f"Vehicle discovered for user {user.get('id')}: {vehicle.get('id')}")
        # TODO: Onboard the new device, backfill data

    elif event == "user:charger:updated":
        user = evt.get("user", {})
        charger = evt.get("charger", {})
        print(f"Charger updated for user {user.get('id')}: {charger.get('id')}")
        # TODO: Sync charging status, availability

    elif event == "user:battery:updated":
        user = evt.get("user", {})
        battery = evt.get("battery", {})
        print(f"Battery updated for user {user.get('id')}: {battery.get('id')}")
        # TODO: Track state of charge, power flow

    elif event == "user:credentials:invalidated":
        user = evt.get("user", {})
        print(f"Credentials invalidated for user {user.get('id')}")
        # TODO: Prompt the user to re-link their vendor account

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/enode")
async def enode_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    signature_header = request.headers.get("x-enode-signature")
    delivery_id = request.headers.get("x-enode-delivery")

    # Verify webhook signature against the RAW body
    if not verify_enode_webhook(raw_body, signature_header, enode_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification - Enode sends an ARRAY of events
    try:
        events = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(events, list):
        raise HTTPException(status_code=400, detail="Expected an array of events")

    print(f"Received {len(events)} event(s) (delivery: {delivery_id})")

    for evt in events:
        handle_enode_event(evt)

    # Return 200 quickly to acknowledge receipt (Enode times out after 5s)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
