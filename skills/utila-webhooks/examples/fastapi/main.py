# Generated with: utila-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import json
import os

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from fastapi import FastAPI, Request, Response

app = FastAPI()


def _load_public_key():
    """Load Utila's PEM RSA-4096 PUBLIC key from the environment.

    Utila signs deliveries with an RSA-4096 PRIVATE key (SHA-512 + PSS) and
    publishes the matching public key in the Console (Vault Settings -> Webhooks).
    There is no shared secret.
    """
    pem = os.environ.get("UTILA_WEBHOOK_PUBLIC_KEY")
    if not pem:
        raise RuntimeError("UTILA_WEBHOOK_PUBLIC_KEY is not set")
    # Support keys stored on a single line with escaped \n newlines.
    if "\\n" in pem:
        pem = pem.replace("\\n", "\n")
    return serialization.load_pem_public_key(pem.encode("utf-8"))


def verify_utila_signature(raw_body: bytes, signature_b64: str | None) -> bool:
    """Verify the base64 x-utila-signature over the RAW request body."""
    if not signature_b64:
        return False
    try:
        public_key = _load_public_key()
        public_key.verify(
            base64.b64decode(signature_b64),
            raw_body,  # the exact request bytes, NOT parsed JSON
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA512()),
                salt_length=padding.PSS.AUTO,  # auto-detect PSS salt on verify
            ),
            hashes.SHA512(),
        )
        return True
    except (InvalidSignature, ValueError, TypeError):
        # Bad signature / malformed key / bad base64 => not authentic.
        return False


@app.post("/webhooks/utila")
async def utila_webhook(request: Request):
    # CRITICAL: read the raw bytes — the signature is over the exact raw body.
    raw_body = await request.body()
    signature = request.headers.get("x-utila-signature")

    if not verify_utila_signature(raw_body, signature):
        return Response(content="Invalid signature", status_code=400)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON", status_code=400)

    # Utila sends no timestamp, so dedupe on event["id"] — the same id can arrive
    # more than once because non-200 deliveries are retried for up to 24h.
    # TODO: check event["id"] against a store and skip if already processed.

    # Payloads are thin: id, vault, type, resourceType, resource, details.
    # Fetch the full object from the Utila API using event["resource"] as needed.
    event_type = event.get("type")
    resource = event.get("resource")

    if event_type == "TRANSACTION_CREATED":
        print("Transaction created:", resource)
    elif event_type == "TRANSACTION_STATE_UPDATED":
        print("Transaction state updated:", resource, event.get("details"))
    elif event_type == "WALLET_CREATED":
        print("Wallet created:", resource)
    elif event_type == "WALLET_ADDRESS_CREATED":
        print("Wallet address created:", resource)
    elif event_type == "TRANSACTION_AML_SCREENING_RESULT_READY":
        print("AML screening result ready:", resource, event.get("details"))
    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge with 200 so Utila stops retrying.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
