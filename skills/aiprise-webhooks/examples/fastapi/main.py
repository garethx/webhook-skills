# Generated with: aiprise-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

aiprise_api_key = os.environ.get("AIPRISE_API_KEY")


def verify_aiprise_webhook(raw_body: bytes, signature_header: str, api_key: str) -> bool:
    """Verify an AiPrise callback signature.

    AiPrise signs the raw request body with HMAC-SHA256 using your API private key
    and sends the lowercase hex digest in the X-HMAC-SIGNATURE header. There is no
    separate webhook secret — the signing key IS the API private key.
    """
    if not signature_header:
        return False

    expected_signature = hmac.new(
        api_key.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest().lower()

    # Timing-safe comparison.
    return hmac.compare_digest(signature_header.lower(), expected_signature)


@app.post("/webhooks/aiprise")
async def aiprise_webhook(request: Request):
    # Read the raw body for signature verification — do NOT parse it first.
    raw_body = await request.body()
    signature_header = request.headers.get("x-hmac-signature")

    # Verify the signature before trusting the payload.
    if not verify_aiprise_webhook(raw_body, signature_header, aiprise_api_key):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification.
    payload = json.loads(raw_body)
    session_id = payload.get("verification_session_id")
    client_ref = payload.get("client_reference_id")
    result = (payload.get("aiprise_summary") or {}).get("verification_result")

    ref = f" (ref: {client_ref})" if client_ref else ""
    print(f"AiPrise callback for session {session_id}{ref} -> {result}")

    # The outcome IS the verification_result value.
    if result == "APPROVED":
        print("Verification approved")
        # TODO: Provision access, mark the customer verified.

    elif result == "DECLINED":
        print("Verification declined")
        # TODO: Block onboarding, request resubmission, flag for review.

    elif result == "REVIEW":
        print("Verification needs manual review")
        # TODO: Route to a human analyst / compliance queue.

    elif result == "UNKNOWN":
        print("Verification result unknown")
        # TODO: Retry or investigate.

    else:
        print(f"Unhandled verification_result: {result}")

    # Return 200 to acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
