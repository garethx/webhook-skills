# Generated with: praxis-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import time

from fastapi import FastAPI, Request, Response

app = FastAPI()

MERCHANT_SECRET = os.environ.get("PRAXIS_MERCHANT_SECRET", "")

# Fixed field order per notification type. Praxis concatenates these VALUES (in
# this order, NOT alphabetized), appends the Merchant Secret, then SHA-384s it.
PAYMENT_FIELDS = [
    "merchant_id",
    "application_key",
    "timestamp",
    "customer.customer_token",
    "session.order_id",
    "transaction.tid",
    "transaction.currency",
    "transaction.amount",
    "transaction.conversion_rate",
    "transaction.processed_currency",
    "transaction.processed_amount",
]
SUBSCRIPTION_FIELDS = [
    "event",
    "merchant_id",
    "application_key",
    "cid",
    "plan_id",
    "subscription_id",
    "subscription_status",
    "timestamp",
]


def _at(obj, path):
    """Read a (possibly nested) dot-path value from the parsed body."""
    cur = obj
    for key in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def verify_praxis(body, header_sig, merchant_secret):
    """Verify the inbound ``gt-authentication`` signature.

    Praxis signs a fixed list of field VALUES: concatenate them in the documented
    order, append the Merchant Secret, and SHA-384 the result (hex). This is NOT
    an HMAC and NOT Standard Webhooks. A Subscription Notification carries an
    ``event`` field; a Payment Notification does not.
    """
    fields = SUBSCRIPTION_FIELDS if body.get("event") else PAYMENT_FIELDS
    data = "".join("" if _at(body, p) is None else str(_at(body, p)) for p in fields)
    expected = hashlib.sha384((data + merchant_secret).encode("utf-8")).hexdigest()
    return hmac.compare_digest(expected, str(header_sig or ""))  # timing-safe


def acknowledge(merchant_secret):
    """Build the signed acknowledgement Praxis expects: HTTP 200, a
    ``{"status": 0}`` body, and an ``external-request-signature`` header over
    ``status + timestamp + secret``. A missing/incorrect signature makes Praxis
    retry the delivery."""
    status = 0
    timestamp = int(time.time())
    signature = hashlib.sha384(
        f"{status}{timestamp}{merchant_secret}".encode("utf-8")
    ).hexdigest()
    return Response(
        content=json.dumps({"status": status, "timestamp": timestamp}),
        media_type="application/json",
        headers={"external-request-signature": signature},
    )


def handle_notification(body):
    """Dispatch on the notification type and its status."""
    event = body.get("event")
    if event:
        # Subscription Notification — identified by the ``event`` field.
        if event in (
            "SubscriptionCreated",
            "SubscriptionActivated",
            "SubscriptionDeactivated",
            "SubscriptionExpired",
            "SubscriptionCanceled",
        ):
            print(f"Subscription lifecycle: event={event} status={body.get('subscription_status')}")
        elif event in (
            "PaymentAttemptApproved",
            "PaymentSucceeded",
            "PaymentManuallyPaid",
            "PaymentRefundSucceeded",
        ):
            print(f"Subscription payment ok: event={event} subscription_id={body.get('subscription_id')}")
        elif event in ("PaymentAttemptFailed", "PaymentFailed", "PaymentRefundFailed"):
            print(f"Subscription payment problem: event={event} subscription_id={body.get('subscription_id')}")
        else:
            print(f"Unhandled subscription event: {event}")
        return

    # Payment Notification — dispatch on transaction.transaction_status.
    status = _at(body, "transaction.transaction_status")
    tid = _at(body, "transaction.tid")
    if status == "initialized":
        print(f"Payment initialized: tid={tid}")
    elif status == "pending":
        print(f"Payment pending: tid={tid}")
    elif status == "approved":
        print(f"Payment approved: tid={tid}")
    elif status == "rejected":
        print(f"Payment rejected: tid={tid}")
    elif status == "error":
        print(f"Payment error: tid={tid}")
    else:
        print(f"Unhandled transaction_status: {status}")


@app.post("/webhooks/praxis")
async def praxis_webhook(request: Request) -> Response:
    header_sig = request.headers.get("gt-authentication")
    raw_body = await request.body()

    if not header_sig:
        return Response(
            content=json.dumps({"error": "Missing gt-authentication header"}),
            media_type="application/json",
            status_code=400,
        )

    # 1) Parse the JSON (required to rebuild the signed field-value string).
    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(
            content=json.dumps({"error": "Invalid JSON"}),
            media_type="application/json",
            status_code=400,
        )

    # 2) Verify the SHA-384 signature over the field values + Merchant Secret.
    if not verify_praxis(body, header_sig, MERCHANT_SECRET):
        return Response(
            content=json.dumps({"error": "Invalid signature"}),
            media_type="application/json",
            status_code=400,
        )

    # 3) Handle the notification.
    try:
        handle_notification(body)
    except Exception as err:  # noqa: BLE001
        print(f"Handler error: {err}")
        return Response(
            content=json.dumps({"error": "Handler error"}),
            media_type="application/json",
            status_code=500,
        )

    # 4) Reply 200 with a signed { status: 0 } acknowledgement.
    return acknowledge(MERCHANT_SECRET)
