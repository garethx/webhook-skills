# Generated with: volume-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Volume webhook receiver for FastAPI.

VOLUME WEBHOOK VERIFICATION

  header    : Authorization: SHA256withRSA <base64 signature>
  algorithm : RSA PKCS#1 v1.5 with SHA-256 (Java "SHA256withRSA"). NOT PSS,
              NOT HMAC — there is no shared secret.
  signed    : the RAW request body bytes, nothing else (no timestamp, no id)
  key       : Volume's RSA-2048 public key, served as bare base64 SPKI
              (no BEGIN/END lines) from an environment-specific URL
  method    : Volume delivers with HTTP PUT
"""

import base64
import binascii
import json
import logging
import os
import re
import time
from typing import Optional

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("volume-webhooks")

app = FastAPI(title="Volume Webhook Handler")

PEM_URLS = {
    "sandbox": "https://api.sandbox.volumepay.io/.well-known/signature/pem",
    "live": "https://api.volumepay.io/.well-known/signature/pem",
}
KEY_CACHE_TTL_SECONDS = 60 * 60  # re-fetch the public key hourly

_key_cache: Optional[dict] = None  # {"source", "key", "expires_at"}


def parse_public_key(value: str) -> rsa.RSAPublicKey:
    """Turn either a PEM string or Volume's bare base64 SPKI body into a key."""
    text = value.strip()
    if "-----BEGIN" in text:
        key = serialization.load_pem_public_key(text.replace("\\n", "\n").encode())
    else:
        key = serialization.load_der_public_key(base64.b64decode("".join(text.split())))
    if not isinstance(key, rsa.RSAPublicKey):
        raise ValueError("Volume public key must be an RSA key")
    return key


def pem_url() -> str:
    if os.environ.get("VOLUME_PEM_URL"):
        return os.environ["VOLUME_PEM_URL"]
    env = os.environ.get("VOLUME_ENV", "sandbox").lower()
    if env not in PEM_URLS:
        raise ValueError(f'VOLUME_ENV must be "sandbox" or "live", got "{env}"')
    return PEM_URLS[env]


async def fetch_pem(url: str) -> str:
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.text


async def get_volume_public_key() -> rsa.RSAPublicKey:
    """VOLUME_PUBLIC_KEY (literal key) wins; otherwise fetch and cache the key
    from VOLUME_PEM_URL / the VOLUME_ENV URL. Raises if it can't be obtained —
    callers must treat that as a rejection."""
    global _key_cache
    literal = os.environ.get("VOLUME_PUBLIC_KEY")
    if literal:
        return parse_public_key(literal)

    url = pem_url()
    if _key_cache and _key_cache["source"] == url and _key_cache["expires_at"] > time.time():
        return _key_cache["key"]

    key = parse_public_key(await fetch_pem(url))
    _key_cache = {"source": url, "key": key, "expires_at": time.time() + KEY_CACHE_TTL_SECONDS}
    return key


def clear_key_cache() -> None:
    global _key_cache
    _key_cache = None


_BASE64 = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")


def verify_volume_signature(
    raw_body: bytes, authorization: Optional[str], public_key: rsa.RSAPublicKey
) -> bool:
    """True only for a valid SHA256withRSA signature over the exact raw body."""
    if not authorization or public_key is None:
        return False

    # "SHA256withRSA <signature>": scheme token, then the standard-base64 signature.
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "SHA256withRSA":
        return False
    if not _BASE64.match(parts[1]):  # rejects base64url / stray chars
        return False

    try:
        signature = base64.b64decode(parts[1], validate=True)
        public_key.verify(signature, raw_body, padding.PKCS1v15(), hashes.SHA256())
        return True
    except (InvalidSignature, binascii.Error, ValueError):
        return False


async def verified_volume_body(request: Request) -> bytes:
    """FastAPI dependency: returns the raw body only if Volume signed it."""
    try:
        public_key = await get_volume_public_key()
    except Exception as exc:
        # Fail closed. A non-200 makes Volume retry later.
        logger.error("Volume public key unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="Signature key unavailable")

    # Raw bytes — re-serialising parsed JSON changes them and breaks the signature.
    raw_body = await request.body()
    if not verify_volume_signature(raw_body, request.headers.get("authorization"), public_key):
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


# Idempotency: Volume retries until it gets a 200, and one payment can produce
# COMPLETED and later SETTLED, so dedupe on paymentId + paymentStatus.
# Use a database or Redis in production.
processed: set = set()

# Replace with your payments table, keyed by paymentId:
# paymentId -> {"merchantPaymentId": ..., "amount_minor": ..., "currency": ...}
payments: dict = {}


def reconcile(payload: dict, record: Optional[dict]) -> list:
    """Volume's docs: verify amount, currency and merchantPaymentId against the
    payment record YOU created, and stop processing on any mismatch.
    `amount` is in MAJOR units (24.23 = £24.23), so convert before comparing."""
    if not record:
        return ["no matching payment record"]
    problems = []
    request_data = payload.get("paymentRequest") or {}
    try:
        amount_minor = round(float(request_data.get("amount")) * 100)
    except (TypeError, ValueError):
        amount_minor = None
    if amount_minor != record["amount_minor"]:
        problems.append("amount mismatch")
    if request_data.get("currency") != record["currency"]:
        problems.append("currency mismatch")
    if "merchantPaymentId" in record and payload.get("merchantPaymentId") != record["merchantPaymentId"]:
        problems.append("merchantPaymentId mismatch")
    return problems


def handle_payment(payload: dict) -> None:
    status = payload.get("paymentStatus")
    if status == "COMPLETED":
        # Payment succeeded — fulfil the order and notify the customer.
        logger.info("Payment %s COMPLETED", payload["paymentId"])
    elif status == "SETTLED":
        # Virtual accounts only: funds settled. Internal/operational use —
        # notify customers on COMPLETED, not on SETTLED.
        logger.info("Payment %s SETTLED", payload["paymentId"])
    elif status == "FAILED":
        logger.info("Payment %s FAILED: %s", payload["paymentId"], payload.get("errorDescription"))
    else:
        logger.info("Unhandled paymentStatus: %s", status)


# Volume delivers with PUT; POST is accepted too.
@app.api_route("/webhooks/volume", methods=["PUT", "POST"])
async def volume_webhook(raw_body: bytes = Depends(verified_volume_body)):
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    dedupe_key = f"{payload.get('paymentId')}:{payload.get('paymentStatus')}"
    if dedupe_key in processed:
        return {"received": True, "duplicate": True}

    problems = reconcile(payload, payments.get(payload.get("paymentId")))
    if problems:
        # Authentic, but it does not match what we expect — do not fulfil.
        # Acknowledge so Volume stops retrying, and alert a human.
        logger.warning("Volume payment %s not processed: %s", payload.get("paymentId"), ", ".join(problems))
        return {"received": True, "processed": False}

    processed.add(dedupe_key)
    handle_payment(payload)
    return {"received": True, "processed": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
