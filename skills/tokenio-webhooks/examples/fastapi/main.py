# Generated with: tokenio-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import base64

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Header, HTTPException
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

load_dotenv()

app = FastAPI()

token_public_key = os.environ.get("TOKEN_WEBHOOK_PUBLIC_KEY")


def _b64url_decode(value: str) -> bytes:
    """Decode base64url with no padding (as Token.io sends it)."""
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def verify_token_webhook(
    raw_body: bytes, signature_header: str, public_key_b64url: str
) -> bool:
    """Verify a Token.io webhook.

    Token.io signs the RAW request body with Ed25519 (asymmetric — NOT HMAC and
    NOT Standard Webhooks). Two headers arrive with every delivery:

        token-signature: Ed25519 signature of the raw body, base64url encoded
        token-event:     the event type (e.g. PAYMENT_STATUS_CHANGED)

    Verify with your member's Ed25519 PUBLIC key (base64url, no padding) from the
    Token Dashboard -> Settings -> Member Information.
    """
    if not signature_header or not public_key_b64url:
        return False
    try:
        key = Ed25519PublicKey.from_public_bytes(_b64url_decode(public_key_b64url))
        key.verify(_b64url_decode(signature_header), raw_body)
        return True
    except (InvalidSignature, ValueError):
        # Bad signature, or a malformed key/signature = invalid.
        return False


@app.post("/webhooks/tokenio")
async def tokenio_webhook(
    request: Request,
    token_signature: str = Header(default=None),
    token_event: str = Header(default=None),
):
    # Read the raw body — required for signature verification.
    raw_body = await request.body()

    # Verify before parsing. Fail closed on a missing/invalid signature.
    if not verify_token_webhook(raw_body, token_signature, token_public_key):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Safe to parse now that the signature checks out.
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event type is in the `token-event` header, not the body.
    print(f"Received Token.io event: {token_event}")

    if token_event == "PAYMENT_STATUS_CHANGED":
        payment = payload.get("payment", {})
        # Drive logic off the normalized `status`; keep `bankPaymentStatus`
        # (raw ISO 20022) for audit/debugging.
        status = payment.get("status")
        print(
            f"Payment {payment.get('id')} -> {status} "
            f"(bank: {payment.get('bankPaymentStatus')})"
        )
        if status == "INITIATION_PROCESSING":
            pass  # TODO: mark payment as processing
        elif status == "INITIATION_COMPLETED":
            pass  # TODO: mark payment accepted by the bank
        elif status == "INITIATION_REJECTED":
            pass  # TODO: mark payment rejected, notify the customer
        elif status == "SUCCESS":
            pass  # TODO: funds confirmed — fulfil the order
        else:
            print(f"Unhandled payment status: {status}")
    elif token_event == "TRANSFER_STATUS_CHANGED":
        pass  # TODO: Payments v1 transfer status change
    elif token_event == "REFUND_STATUS_CHANGED":
        pass  # TODO: reconcile refund status
    elif token_event == "VRP_STATUS_CHANGED":
        pass  # TODO: Variable Recurring Payment status change
    elif token_event == "VRP_CONSENT_STATUS_CHANGED":
        pass  # TODO: VRP consent / mandate lifecycle
    elif token_event == "VIRTUAL_ACCOUNT_CREDIT_RECEIVED":
        pass  # TODO: reconcile inbound funds on a virtual account
    elif token_event == "PAYOUT_STATUS_CHANGED":
        pass  # TODO: settlement / payout tracking
    else:
        print(f"Unhandled event: {token_event}")

    # Acknowledge quickly so Token.io does not retry.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
