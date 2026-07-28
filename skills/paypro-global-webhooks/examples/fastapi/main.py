# Generated with: paypro-global-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import os

from fastapi import FastAPI, Request, Response

app = FastAPI()

# Fixed PayPro Global source IPs. Enforcing this is optional defence-in-depth —
# prefer doing it at your firewall/load balancer where the real client IP is
# reliable. Behind a proxy the client IP comes from x-forwarded-for.
PAYPRO_IPS = {
    "198.199.123.239",
    "157.230.8.40",
    "2604:a880:400:d0::1843:7001",
    "2604:a880:400:d1::b6c:c001",
}


def _timing_safe_equal_hex(a: str, b: str) -> bool:
    """Case-insensitive, timing-safe comparison of two hex digests."""
    return hmac.compare_digest(str(a).lower(), str(b).lower())


def verify_signature(f: dict, validation_key: str) -> bool:
    """Verify the PayPro Global SIGNATURE (SHA256) — the primary check.

    SIGNATURE = SHA256(ORDER_ID + ORDER_STATUS + ORDER_TOTAL_AMOUNT +
      CUSTOMER_EMAIL + VALIDATION_KEY + TEST_MODE + IPN_TYPE_NAME), hex.

    The exact field order — and appending TEST_MODE and IPN_TYPE_NAME at the end
    — is easy to get wrong. The signature covers specific field VALUES, not the
    raw body, so recomputing from parsed form fields is correct here.
    """
    if not validation_key or not f.get("SIGNATURE"):
        return False
    base = (
        f"{f.get('ORDER_ID', '')}{f.get('ORDER_STATUS', '')}"
        f"{f.get('ORDER_TOTAL_AMOUNT', '')}{f.get('CUSTOMER_EMAIL', '')}"
        f"{validation_key}{f.get('TEST_MODE', '')}{f.get('IPN_TYPE_NAME', '')}"
    )
    expected = hashlib.sha256(base.encode("utf-8")).hexdigest()
    return _timing_safe_equal_hex(expected, f["SIGNATURE"])


def verify_hash(f: dict, secret_key: str) -> bool:
    """Verify the PayPro Global HASH (MD5) — legacy/secondary check.

    HASH = MD5(ORDER_ID + SecretKey) for real orders, or MD5("1") for test
    orders (TEST_MODE == "1"). Uses the SECRET_KEY, which is DIFFERENT from the
    VALIDATION_KEY used by SIGNATURE.
    """
    if not secret_key or not f.get("HASH"):
        return False
    is_test = str(f.get("TEST_MODE")) == "1"
    base = "1" if is_test else f"{f.get('ORDER_ID', '')}{secret_key}"
    expected = hashlib.md5(base.encode("utf-8")).hexdigest()
    return _timing_safe_equal_hex(expected, f["HASH"])


def handle_event(f: dict) -> None:
    """Dispatch on the IPN_TYPE_NAME field. Note the non-standard spelling
    "SubscriptionChargeSucceed" (not "Succeeded")."""
    event = f.get("IPN_TYPE_NAME")
    order_id = f.get("ORDER_ID")

    if event == "OrderCharged":
        print(f"Order {order_id} charged ({f.get('ORDER_TOTAL_AMOUNT')})")
        # TODO: fulfil order, grant access, deliver license.
    elif event in ("OrderRefunded", "OrderPartiallyRefunded"):
        print(f"Order {order_id} refunded ({event})")
        # TODO: revoke/adjust access, update accounting.
    elif event == "OrderChargedBack":
        print(f"Order {order_id} charged back")
        # TODO: suspend account, gather evidence.
    elif event in ("SubscriptionChargeSucceed", "SubscriptionRenewed"):
        print(f"Subscription for order {order_id} extended ({event})")
        # TODO: extend subscription period.
    elif event == "SubscriptionChargeFailed":
        print(f"Subscription charge failed for order {order_id}")
        # TODO: dunning, notify customer.
    elif event in ("SubscriptionTerminated", "SubscriptionSuspended", "SubscriptionFinished"):
        print(f"Subscription ended for order {order_id} ({event})")
        # TODO: revoke/pause access.
    else:
        print(f"Unhandled IPN_TYPE_NAME: {event}")


@app.post("/webhooks/paypro-global")
async def paypro_webhook(request: Request) -> Response:
    validation_key = os.environ.get("PAYPRO_VALIDATION_KEY")
    secret_key = os.environ.get("PAYPRO_SECRET_KEY")

    # Layer 1 (optional): restrict to PayPro Global's fixed source IPs.
    if os.environ.get("PAYPRO_ENFORCE_IP") == "true":
        forwarded = request.headers.get("x-forwarded-for", "")
        client_ip = (
            forwarded.split(",")[0].strip()
            if forwarded
            else (request.client.host if request.client else "")
        )
        if client_ip not in PAYPRO_IPS:
            print(f"Rejected IPN from non-allowlisted IP: {client_ip}")
            return Response("Forbidden", status_code=403)

    # PayPro Global posts application/x-www-form-urlencoded — parse it as form
    # data. The SIGNATURE covers field values (not the raw body), so parsing
    # first is fine.
    form = await request.form()
    f = {k: v for k, v in form.items() if isinstance(v, str)}

    # Layer 2 (primary): SIGNATURE (SHA256).
    if not verify_signature(f, validation_key):
        print("PayPro Global SIGNATURE verification failed")
        return Response("Invalid signature", status_code=400)

    # Layer 3 (optional): HASH (MD5). Enforced only when a secret key is set.
    if secret_key and not verify_hash(f, secret_key):
        print("PayPro Global HASH verification failed")
        return Response("Invalid hash", status_code=400)

    print(f"Verified IPN {f.get('IPN_TYPE_NAME')} for order {f.get('ORDER_ID')}")
    handle_event(f)

    # Acknowledge with 200 — anything else triggers PayPro Global's retries
    # (every 30 minutes, up to 3 attempts).
    return Response("OK", status_code=200)
