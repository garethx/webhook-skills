# Generated with: meraki-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import hmac
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

meraki_secret = os.environ.get("MERAKI_WEBHOOK_SECRET")


def verify_meraki_webhook(raw_body: bytes, secret: str) -> bool:
    """Verify a Cisco Meraki webhook.

    Meraki does NOT sign webhooks with an HMAC header. It echoes the "Shared
    secret" you configured on the HTTP server back inside the JSON body as
    ``sharedSecret``. Verification is a timing-safe string compare on that
    field. TLS (HTTPS with a CA-trusted cert) is the real transport protection.
    """
    try:
        payload = json.loads(raw_body)
    except ValueError:
        return False

    received = str(payload.get("sharedSecret", ""))
    # compare_digest is constant-time and length-safe.
    return hmac.compare_digest(received, secret or "")


@app.post("/webhooks/meraki")
async def meraki_webhook(request: Request):
    # Read the raw body so we control JSON parsing/verification
    raw_body = await request.body()

    # Verify the shared secret (carried in the body, not a header)
    if not verify_meraki_webhook(raw_body, meraki_secret):
        raise HTTPException(status_code=401, detail="Invalid shared secret")

    # Parse the payload after verification
    payload = json.loads(raw_body)
    alert_type_id = payload.get("alertTypeId")

    print(
        f'Received "{payload.get("alertType")}" ({alert_type_id}) '
        f'for network {payload.get("networkName")} (alertId: {payload.get("alertId")})'
    )

    # Dispatch on alertTypeId (stable id), not alertType (human label)
    if alert_type_id == "motion_alert":
        print(f"Motion detected on device {payload.get('deviceSerial')}")
        # TODO: capture snapshot, notify security, etc.

    elif alert_type_id == "settings_changed":
        print(f"Settings changed in {payload.get('networkName')}")
        # TODO: audit the change, alert compliance, etc.

    elif alert_type_id == "sensor_alert":
        print(f"Sensor alert on {payload.get('deviceSerial')}: {payload.get('alertData')}")
        # TODO: create incident, page facilities, etc.

    elif alert_type_id == "stopped_reporting":
        print(f"Device(s) stopped reporting in {payload.get('networkName')}")
        # TODO: open uptime incident, page on-call, etc.

    else:
        print(f"Unhandled alert type: {alert_type_id}")

    # Return 200 quickly to acknowledge receipt (avoid auto-disable)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
