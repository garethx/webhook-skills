# Generated with: circle-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import os

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePublicKey
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response

load_dotenv()

app = FastAPI()

# Circle production: https://api.circle.com — sandbox: https://api-sandbox.circle.com
CIRCLE_API_BASE_URL = os.environ.get("CIRCLE_API_BASE_URL", "https://api.circle.com")

# Public key cache — keyed by the X-Circle-Key-Id UUID. The public key for a
# given keyId is static, so a cache miss == fetch once. Exposed for tests to preload.
public_key_cache: dict[str, EllipticCurvePublicKey] = {}


def get_public_key(key_id: str) -> EllipticCurvePublicKey:
    cached = public_key_cache.get(key_id)
    if cached is not None:
        return cached

    api_key = os.environ.get("CIRCLE_API_KEY")
    if not api_key:
        raise ValueError("CIRCLE_API_KEY is not set")

    response = httpx.get(
        f"{CIRCLE_API_BASE_URL}/v2/cpn/notifications/publicKey/{key_id}",
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=10,
    )
    response.raise_for_status()
    data = response.json()["data"]

    # Circle returns a base64-encoded DER (SPKI) ECDSA public key.
    public_key = serialization.load_der_public_key(base64.b64decode(data["publicKey"]))
    public_key_cache[key_id] = public_key
    return public_key


def verify_circle_webhook(headers, raw_body: bytes) -> bool:
    signature_b64 = headers.get("x-circle-signature")
    key_id = headers.get("x-circle-key-id")
    if not signature_b64 or not key_id:
        return False

    try:
        public_key = get_public_key(key_id)
    except (ValueError, httpx.HTTPError):
        return False

    # ECDSA_SHA_256 over the RAW request body; the signature is base64-encoded
    # and DER-encoded.
    try:
        public_key.verify(
            base64.b64decode(signature_b64),
            raw_body,
            ec.ECDSA(hashes.SHA256()),
        )
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


# Circle validates the endpoint with a HEAD request when a subscription is
# created or updated. Respond 200 so the subscription activates.
@app.head("/webhooks/circle")
async def circle_webhook_head():
    return Response(status_code=200)


@app.post("/webhooks/circle")
async def circle_webhook(request: Request):
    # CRITICAL: read raw bytes — the signature is over the exact raw body.
    raw_body = await request.body()

    if not verify_circle_webhook(request.headers, raw_body):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    notification_type = event.get("notificationType")

    # Dedupe on event["notificationId"] (a UUID) — Circle retries non-200
    # deliveries, so the same notificationId can arrive more than once.
    resource = event.get("notification") or {}

    if notification_type == "cpn.payment.completed":
        print(f"Payment completed: {resource.get('id')} {resource.get('status')}")
    elif notification_type == "cpn.payment.failed":
        print(f"Payment failed: {resource.get('id')} {resource.get('status')}")
    elif notification_type == "cpn.transaction.completed":
        print(f"Transaction completed: {resource.get('id')} {resource.get('status')}")
    elif notification_type == "cpn.transaction.broadcasted":
        print(f"Transaction broadcasted: {resource.get('id')} {resource.get('status')}")
    elif notification_type == "cpn.rfi.approved":
        print(f"RFI approved: {resource.get('id')} {resource.get('status')}")
    elif notification_type == "cpn.rfi.rejected":
        print(f"RFI rejected: {resource.get('id')} {resource.get('status')}")
    else:
        # Other cpn.* types: cpn.payment.delayed, cpn.transaction.failed,
        # cpn.rfi.* (e.g. information-needed), etc.
        print(f"Unhandled notification type: {notification_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
