# Generated with: paystack-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

paystack_secret = os.environ.get("PAYSTACK_SECRET_KEY", "")


def verify_paystack_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Paystack webhook signature.

    Paystack's SDKs have no webhook verification helper, so we verify manually:
    HMAC-SHA512 (hex) over the RAW request body, keyed with your secret key,
    compared against the x-paystack-signature header using a timing-safe compare.
    """
    if not signature_header:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,  # raw bytes, NOT parsed JSON
        hashlib.sha512,
    ).hexdigest()

    return hmac.compare_digest(expected_signature, signature_header)


@app.post("/webhooks/paystack")
async def paystack_webhook(request: Request):
    # Read the RAW body for signature verification (do not parse first)
    raw_body = await request.body()
    signature_header = request.headers.get("x-paystack-signature")

    # Verify the signature BEFORE parsing the body
    if not verify_paystack_webhook(raw_body, signature_header, paystack_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification succeeds
    payload = json.loads(raw_body)
    event = payload.get("event")
    data = payload.get("data", {})

    print(f"Received {event} event")

    # The event type is in the body's `event` field, not a header.
    if event == "charge.success":
        print(f"Charge succeeded: {data.get('reference')} ({data.get('amount')} {data.get('currency')})")
        # TODO: Re-verify via GET /transaction/verify/:reference, then fulfil.

    elif event == "transfer.success":
        print(f"Transfer succeeded: {data.get('reference')} ({data.get('transfer_code')})")
        # TODO: Mark the payout complete, notify the recipient.

    elif event == "transfer.failed":
        print(f"Transfer failed: {data.get('reference')} ({data.get('transfer_code')})")
        # TODO: Alert ops, retry the payout, re-credit the balance.

    elif event == "transfer.reversed":
        print(f"Transfer reversed: {data.get('reference')} ({data.get('transfer_code')})")
        # TODO: Reconcile the ledger.

    elif event == "refund.processed":
        print(f"Refund processed for transaction: {data.get('transaction_reference')}")
        # TODO: Update your ledger, notify the customer.

    elif event == "subscription.create":
        print(f"Subscription created: {data.get('subscription_code')}")
        # TODO: Provision the plan, start the billing cycle.

    elif event == "subscription.disable":
        print(f"Subscription disabled: {data.get('subscription_code')}")
        # TODO: Revoke access, offboard the customer.

    elif event == "invoice.create":
        print(f"Invoice created: {data.get('invoice_code')}")
        # TODO: Notify the customer of the upcoming charge.

    elif event == "invoice.update":
        print(f"Invoice updated: {data.get('invoice_code')} (paid: {data.get('paid')})")
        # TODO: Reconcile the charge result.

    elif event == "invoice.payment_failed":
        print(f"Invoice payment failed: {data.get('invoice_code')}")
        # TODO: Start dunning, retry, notify the customer.

    elif event == "charge.dispute.create":
        print(f"Dispute opened: {data.get('id')}")
        # TODO: Gather evidence and respond to the dispute.

    else:
        print(f"Unhandled event: {event}")

    # Return 2xx to acknowledge receipt (Paystack retries non-200 responses)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
