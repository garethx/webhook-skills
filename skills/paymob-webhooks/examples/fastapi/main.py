# Generated with: paymob-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

# The 20 transaction fields Paymob signs, in order. Values are read from the
# transaction object (`obj`) and concatenated with no separators.
HMAC_FIELDS = [
    "amount_cents",
    "created_at",
    "currency",
    "error_occured",
    "has_parent_transaction",
    "id",
    "integration_id",
    "is_3d_secure",
    "is_auth",
    "is_capture",
    "is_refunded",
    "is_standalone_payment",
    "is_voided",
    "order.id",
    "owner",
    "pending",
    "source_data.pan",
    "source_data.sub_type",
    "source_data.type",
    "success",
]


def _stringify(value) -> str:
    """Match Paymob's JSON serialization: booleans are lowercase true/false."""
    if value is True:
        return "true"
    if value is False:
        return "false"
    return str(value)


def _get(obj: dict, path: str):
    """Resolve a dotted key path (e.g. 'order.id', 'source_data.pan')."""
    current = obj
    for part in path.split("."):
        current = (current or {}).get(part)
    return current


def build_signed_string(obj: dict) -> str:
    """Concatenate the 20 signed fields in order, with no separators."""
    return "".join(_stringify(_get(obj, field)) for field in HMAC_FIELDS)


def verify_paymob_hmac(obj: dict, hmac_param: str, secret: str) -> bool:
    """Verify a Paymob callback.

    Paymob computes HMAC-SHA512 (hex) over the concatenated fields and sends it
    as the `hmac` query parameter (NOT a header, NOT the raw body).
    """
    expected = hmac.new(
        secret.encode("utf-8"),
        build_signed_string(obj).encode("utf-8"),
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected, hmac_param or "")


def transaction_state(obj: dict) -> str:
    """Derive a transaction state from the boolean fields.

    Paymob has no discrete event names — every callback `type` is "TRANSACTION".
    """
    if obj.get("is_refunded"):
        return "refunded"
    if obj.get("is_voided"):
        return "voided"
    if obj.get("pending"):
        return "pending"
    if obj.get("success") and obj.get("is_auth") and not obj.get("is_capture"):
        return "authorized"
    if obj.get("is_capture"):
        return "captured"
    if obj.get("success") and not obj.get("error_occured"):
        return "succeeded"
    return "failed"


@app.post("/webhooks/paymob")
async def paymob_webhook(request: Request):
    hmac_param = request.query_params.get("hmac")

    # Parse the JSON — verification needs the individual fields.
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if body.get("type") != "TRANSACTION" or not body.get("obj"):
        raise HTTPException(status_code=400, detail="Unexpected callback payload")

    obj = body["obj"]

    secret = os.environ.get("PAYMOB_HMAC_SECRET", "")
    if not hmac_param or not verify_paymob_hmac(obj, hmac_param, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    state = transaction_state(obj)
    print(f"Transaction {obj['id']} (order {obj['order']['id']}): {state}")

    if state == "succeeded":
        pass  # TODO: mark order paid, fulfil, send receipt
    elif state == "failed":
        pass  # TODO: notify customer, release reservation
    elif state == "pending":
        pass  # TODO: await final callback (e.g. 3-D Secure)
    elif state == "authorized":
        pass  # TODO: funds held; capture when ready
    elif state == "captured":
        pass  # TODO: complete a prior authorization
    elif state == "refunded":
        pass  # TODO: reverse fulfilment, credit customer
    elif state == "voided":
        pass  # TODO: cancel an uncaptured authorization

    # Acknowledge quickly so Paymob does not retry.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
