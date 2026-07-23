# Generated with: smartcar-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json
import os

import smartcar
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Application Management Token (AMT) — keys the HMAC for both the VERIFY
# challenge and per-payload SC-Signature verification.
AMT = os.environ.get("SMARTCAR_MANAGEMENT_TOKEN")


@app.post("/webhooks/smartcar")
async def smartcar_webhook(request: Request):
    # Read the RAW body before parsing. The Smartcar Python SDK hashes the exact
    # string you pass, so verification must run against the raw request body.
    raw_body = (await request.body()).decode("utf-8")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # 1. VERIFY handshake — Smartcar sends this once when the webhook is created
    #    or re-verified. Echo the challenge hashed with the AMT within 15s, or
    #    the webhook never activates.
    if event.get("eventType") == "VERIFY":
        hmac = smartcar.hash_challenge(AMT, event["data"]["challenge"])
        return {"challenge": hmac}

    # 2. Verify the SC-Signature header (hex HMAC-SHA256 of the raw body).
    signature = request.headers.get("sc-signature")
    if not signature or not smartcar.verify_payload(AMT, signature, raw_body):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # 3. Handle the event. Dedupe on event["eventId"] (stable across retries;
    #    meta.deliveryId changes per attempt).
    event_type = event.get("eventType")

    if event_type == "VEHICLE_STATE":
        triggers = ", ".join(t["name"] for t in event["data"].get("triggers", []))
        print(f"VEHICLE_STATE for {event.get('vehicleId')} — triggered by: {triggers}")
        # TODO: persist event["data"]["signals"], update dashboards, fire alerts.

    elif event_type == "VEHICLE_ERROR":
        for err in event["data"].get("errors", []):
            print(f"VEHICLE_ERROR for {event.get('vehicleId')}: {err['code']} ({err['state']})")
        # TODO: surface connection issues; clear them on a follow-up event with
        #       errors[].state == "RESOLVED".

    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge quickly (respond within 15s). Do heavy work asynchronously.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
