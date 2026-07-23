# Generated with: wix-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json

import jwt  # PyJWT
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

# Your app's RSA public key. Stored on one line in .env with `\n` escapes, so
# restore the real newlines before PyJWT uses it.
PUBLIC_KEY = os.environ.get("WIX_PUBLIC_KEY", "").replace("\\n", "\n")

# In-memory dedupe store. Wix retries deliveries, so the same event can arrive
# more than once and out of order. Use a durable store (Redis, DB) in production.
processed_events: set[str] = set()


def verify_and_decode(raw_body: bytes, public_key: str) -> dict:
    """Verify a Wix webhook JWT and unwrap its nested envelope.

    Wix has no official Python SDK, so we verify manually: the entire request
    body is a JWT signed by Wix with RS256. Verify it with your app's public key,
    then parse the two nested `data` strings.
    """
    # Raises jwt.InvalidTokenError on a bad signature or expired token.
    decoded = jwt.decode(raw_body, public_key, algorithms=["RS256"])
    event = json.loads(decoded["data"])          # { eventType, instanceId, data }
    event["entity"] = json.loads(event["data"])  # inner payload: id, entityId, ...
    return event


@app.post("/webhooks/wix")
async def wix_webhook(request: Request):
    # Use the raw body — re-serialized JSON would break the JWT signature.
    raw_body = await request.body()
    if not raw_body:
        return Response(content="Missing webhook body", status_code=400)

    try:
        event = verify_and_decode(raw_body, PUBLIC_KEY)
    except (jwt.InvalidTokenError, json.JSONDecodeError, KeyError) as err:
        print(f"Webhook verification failed: {err}")
        return Response(content="Invalid webhook signature or payload", status_code=400)

    event_type = event["eventType"]
    instance_id = event["instanceId"]
    event_id = event["entity"].get("id")
    entity_id = event["entity"].get("entityId")

    # Deduplicate: acknowledge duplicates without reprocessing.
    if event_id and event_id in processed_events:
        print(f"Duplicate event {event_id} ignored")
        return Response(content="OK", status_code=200)
    if event_id:
        processed_events.add(event_id)

    print(f"Received {event_type} for site {instance_id}")

    # Handle the event based on its type.
    if event_type == "wix.ecom.v1.order_created":
        print(f"Order created: {entity_id}")
        # TODO: fulfil order, notify, sync to your system

    elif event_type == "wix.ecom.v1.order_approved":
        print(f"Order approved: {entity_id}")
        # TODO: trigger fulfilment, grant access

    elif event_type == "wix.ecom.v1.order_updated":
        print(f"Order updated: {entity_id}")
        # TODO: sync order changes

    elif event_type == "wix.ecom.v1.order_canceled":
        print(f"Order canceled: {entity_id}")
        # TODO: reverse fulfilment, revoke access

    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge fast (within ~1250 ms) so Wix doesn't retry.
    return Response(content="OK", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
