import os
import json
import hmac
import hashlib
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("STATSIG_WEBHOOK_SECRET", "")


def verify_statsig_webhook(
    raw_body: bytes, timestamp: str, signature_header: str, secret: str
) -> bool:
    """Verify a Statsig webhook signature.

    The signature is `v0=<hmac-sha256-hex>` computed over the basestring
    `v0:<timestamp>:<raw_body>` using the webhook signing secret.
    """
    if not timestamp or not signature_header:
        return False
    basestring = b"v0:" + timestamp.encode("utf-8") + b":" + raw_body
    expected = "v0=" + hmac.new(
        secret.encode("utf-8"), basestring, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


@app.post("/webhooks/statsig")
async def statsig_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    timestamp = request.headers.get("x-statsig-request-timestamp")
    signature = request.headers.get("x-statsig-signature")

    if not verify_statsig_webhook(raw_body, timestamp, signature, webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Signature verified - safe to parse
    payload = json.loads(raw_body)

    # Statsig delivers events in batches: { "data": [ ... ] }
    events = payload.get("data", [])

    for event in events:
        event_name = event.get("eventName")
        metadata = event.get("metadata", {})

        if event_name == "statsig::gate_exposure":
            print(f"Gate exposure: {metadata.get('gate')}")
            # TODO: record exposure, update analytics, etc.
        elif event_name == "statsig::config_exposure":
            print(f"Config exposure: {metadata.get('config')}")
            # TODO: record exposure, etc.
        elif event_name == "statsig::experiment_exposure":
            print(f"Experiment exposure: {metadata.get('config')}")
            # TODO: record experiment assignment, etc.
        elif event_name == "statsig::config_change":
            print(f"Config change: {metadata}")
            # TODO: audit configuration changes, etc.
        else:
            # Custom events logged via logEvent
            print(f"Custom event: {event_name}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
