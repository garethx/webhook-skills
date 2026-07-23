# Generated with: linkedin-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, HTTPException

load_dotenv()

app = FastAPI()

client_secret = os.environ.get("LINKEDIN_CLIENT_SECRET", "")


def challenge_response(challenge_code: str, secret: str) -> str:
    """Compute the challengeResponse for LinkedIn endpoint validation (GET).

    challengeResponse = hex(HMACSHA256(challengeCode, clientSecret))
    """
    return hmac.new(secret.encode("utf-8"), challenge_code.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_linkedin_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a LinkedIn push-event signature (POST).

    X-LI-Signature = hex(HMACSHA256("hmacsha256=" + rawBody, clientSecret))
    The "hmacsha256=" prefix is part of the string-to-sign only, not the header.
    """
    if not signature_header:
        return False

    string_to_sign = b"hmacsha256=" + raw_body
    expected = hmac.new(secret.encode("utf-8"), string_to_sign, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)


def get_notification_type(payload: dict) -> str:
    """Classify a LinkedIn notification.

    LinkedIn sends no event-type header, so the product is derived from the
    payload. Adapt the field checks to the products your app subscribes to.
    """
    if payload.get("eventType"):
        return payload["eventType"]
    if "leadType" in payload or "leadAction" in payload or "leadMetadata" in payload:
        return "LEAD_ACTION"
    if "organizationSocialAction" in payload or "socialAction" in payload:
        return "ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS"
    return "UNKNOWN"


# Dedupe store — notifications may be delivered more than once.
# Replace with Redis/DB in production.
processed_notifications: set[str] = set()


@app.get("/webhooks/linkedin")
async def validate_endpoint(request: Request):
    """LinkedIn endpoint validation. Must respond within 3s as JSON."""
    challenge_code = request.query_params.get("challengeCode")
    if not challenge_code:
        raise HTTPException(status_code=400, detail="Missing challengeCode")

    return {
        "challengeCode": challenge_code,
        "challengeResponse": challenge_response(challenge_code, client_secret),
    }


@app.post("/webhooks/linkedin")
async def receive_webhook(request: Request):
    """LinkedIn event delivery. Raw body required for signature verification."""
    raw_body = await request.body()
    signature = request.headers.get("x-li-signature")

    if not verify_linkedin_webhook(raw_body, signature, client_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verifying.
    payload = json.loads(raw_body)
    notification_type = get_notification_type(payload)
    notification_id = payload.get("notificationId")

    # Dedupe on notificationId before processing.
    if notification_id and notification_id in processed_notifications:
        print(f"Duplicate notification {notification_id}, skipping")
        return {"received": True}
    if notification_id:
        processed_notifications.add(notification_id)

    print(f"Received {notification_type} notification ({notification_id})")

    if notification_type == "LEAD_ACTION":
        print(f"Lead Sync action: {payload.get('leadType')}")
        # TODO: fetch full lead via the Lead Sync pull API, enqueue to CRM, etc.

    elif notification_type == "ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS":
        print(f"Org social action on: {payload.get('organizationSocialAction') or payload.get('object')}")
        # TODO: moderate comment, notify community manager, etc.

    else:
        print(f"Unhandled notification type: {notification_type}")

    # Acknowledge with a 2xx so LinkedIn does not retry.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
