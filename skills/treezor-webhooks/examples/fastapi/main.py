# Generated with: treezor-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import hmac
import hashlib
import base64
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

TREEZOR_WEBHOOK_SECRET = os.environ.get("TREEZOR_WEBHOOK_SECRET", "")


def canonicalize(object_payload) -> str:
    """Re-serialize object_payload into Treezor's canonical form, matching PHP's
    default json_encode: compact separators, forward slashes escaped, and all
    non-ASCII characters escaped to lowercase \\uXXXX.
    """
    return json.dumps(
        object_payload, ensure_ascii=True, separators=(",", ":")
    ).replace("/", "\\/")


def verify_treezor_webhook(object_payload, received_signature: str, secret: str) -> bool:
    """Verify a Treezor webhook.

    The signature is a BODY FIELD (object_payload_signature), not an HTTP header,
    and covers the canonicalized object_payload -- not the raw request body.
    """
    if not received_signature:
        return False
    expected = base64.b64encode(
        hmac.new(
            secret.encode("utf-8"),
            canonicalize(object_payload).encode("utf-8"),
            hashlib.sha256,
        ).digest()
    ).decode("utf-8")
    return hmac.compare_digest(received_signature, expected)


@app.post("/webhooks/treezor")
async def treezor_webhook(request: Request):
    # Treezor sends webhooks as text/plain -- read the raw body and parse it ourselves.
    raw = await request.body()
    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Verify the signature before trusting anything in the body.
    if not verify_treezor_webhook(
        event.get("object_payload"),
        event.get("object_payload_signature"),
        TREEZOR_WEBHOOK_SECRET,
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Deliveries can be duplicated and arrive out of order.
    # Dedupe on webhook_id and compare webhook_created_at in real handlers.
    event_name = event.get("webhook")
    object_id = event.get("object_id")
    print(f"Received {event_name} (webhook_id={event.get('webhook_id')})")

    if event_name == "payin.create":
        print(f"Pay-in created: {object_id}")
        # TODO: credit wallet, notify user
    elif event_name == "payin.update":
        print(f"Pay-in updated: {object_id}")
        # TODO: track settlement/refund state
    elif event_name == "payout.create":
        print(f"Payout created: {object_id}")
        # TODO: confirm withdrawal initiated
    elif event_name == "payout.update":
        print(f"Payout updated: {object_id}")
        # TODO: track execution/rejection
    elif event_name == "transfer.create":
        print(f"Transfer created: {object_id}")
        # TODO: update balances
    elif event_name == "transaction.create":
        print(f"Transaction created: {object_id}")
        # TODO: reconciliation, statements
    elif event_name == "cardtransaction.create":
        print(f"Card transaction: {object_id}")
        # TODO: real-time spend notification
    elif event_name == "card.create":
        print(f"Card issued: {object_id}")
        # TODO: activate card in UI
    elif event_name == "card.update":
        print(f"Card updated: {object_id}")
        # TODO: reflect lock/unlock, limit changes
    elif event_name == "wallet.create":
        print(f"Wallet created: {object_id}")
        # TODO: provision account for user
    elif event_name == "user.create":
        print(f"User created: {object_id}")
        # TODO: onboarding flow
    elif event_name == "user.update":
        print(f"User updated: {object_id}")
        # TODO: sync profile changes
    elif event_name == "user.kycreview":
        print(f"KYC review: {object_id}")
        # TODO: gate features on KYC level
    else:
        print(f"Unhandled event: {event_name}")

    # Acknowledge receipt. Raise a 5xx instead to trigger Treezor's retries.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
