# Generated with: tikkie-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tikkie API v2 (ABN AMRO) notification receiver.

Tikkie notifications carry NO SIGNATURE — the OpenAPI spec defines only a JSON
body and a 2XX acknowledgement. Do not write an HMAC verifier. Instead:

1. Check `subscriptionId` against the id(s) returned (201) when you subscribed.
   Weak: the id is not a secret-grade credential.
2. Treat the notification as a trigger only and re-fetch the authoritative
   record from the Tikkie API (API-Key + X-App-Token). Forged tokens just 404.
"""
import hmac
import logging
import os
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("tikkie")

NOTIFICATION_TYPES = ("PAYMENT", "REFUND", "BUNDLE")

REQUIRED_FIELDS: Dict[str, List[str]] = {
    "PAYMENT": ["paymentRequestToken", "paymentToken"],
    "REFUND": ["paymentRequestToken", "paymentToken", "refundToken"],
    "BUNDLE": ["bundleId"],
}

DEFAULT_API_BASE_URL = "https://api-sandbox.abnamro.com/v2/tikkie"

# Overridable transport so tests can mock the Tikkie API without the network.
HTTP_TRANSPORT: Optional[httpx.AsyncBaseTransport] = None


def get_allowed_subscription_ids() -> List[str]:
    """Payment-request and transactions subscriptions each have their own id."""
    raw = os.environ.get("TIKKIE_SUBSCRIPTION_ID", "")
    return [s.strip() for s in raw.split(",") if s.strip()]


if not get_allowed_subscription_ids():
    logger.warning(
        "TIKKIE_SUBSCRIPTION_ID is not set — the subscriptionId check is SKIPPED. "
        "Store the subscriptionId returned by POST /paymentrequestssubscription "
        "(and/or /transactionssubscription) and set it here."
    )


def check_subscription_id(subscription_id: str, allowed: Optional[List[str]] = None) -> bool:
    """Weak (non-cryptographic) check. True when nothing is configured."""
    allowed = get_allowed_subscription_ids() if allowed is None else allowed
    if not allowed:
        return True
    return any(hmac.compare_digest(subscription_id.encode(), a.encode()) for a in allowed)


def parse_notification(body: Any) -> Dict[str, Any]:
    """Validate shape. `notificationType` is the discriminator (no event header).

    Raises ValueError on a malformed notification. Unknown notificationType
    values are returned as-is so the caller can ignore them gracefully.
    """
    if not isinstance(body, dict):
        raise ValueError("Body must be a JSON object")
    if not isinstance(body.get("subscriptionId"), str) or not body["subscriptionId"]:
        raise ValueError("Missing subscriptionId")
    ntype = body.get("notificationType")
    if not isinstance(ntype, str) or not ntype:
        raise ValueError("Missing notificationType")
    for field in REQUIRED_FIELDS.get(ntype, []):
        if not isinstance(body.get(field), str) or not body[field]:
            raise ValueError(f"Missing {field} for {ntype}")
    return body


def record_path(n: Dict[str, Any]) -> str:
    """Tikkie API path holding the authoritative record for a notification."""
    def e(v: str) -> str:
        return quote(v, safe="")

    ntype = n["notificationType"]
    if ntype == "PAYMENT":
        return f"/paymentrequests/{e(n['paymentRequestToken'])}/payments/{e(n['paymentToken'])}"
    if ntype == "REFUND":
        return (
            f"/paymentrequests/{e(n['paymentRequestToken'])}/payments/{e(n['paymentToken'])}"
            f"/refunds/{e(n['refundToken'])}"
        )
    if ntype == "BUNDLE":
        return f"/transactionbundles/{e(n['bundleId'])}"
    raise ValueError(f"No record path for {ntype}")


class NotFound:
    """Sentinel: Tikkie returned 404 for the notification's tokens."""


NOT_FOUND = NotFound()


async def fetch_record(n: Dict[str, Any]) -> Any:
    """Re-fetch the record.

    Returns None when credentials are not configured (re-fetch skipped),
    NOT_FOUND when Tikkie returns 404 (likely forged), or the record dict.
    Raises httpx.HTTPError on other failures.
    """
    api_key = os.environ.get("TIKKIE_API_KEY")
    app_token = os.environ.get("TIKKIE_APP_TOKEN")
    if not api_key or not app_token:
        return None

    base_url = os.environ.get("TIKKIE_API_BASE_URL", DEFAULT_API_BASE_URL).rstrip("/")
    async with httpx.AsyncClient(transport=HTTP_TRANSPORT, timeout=10.0) as client:
        res = await client.get(
            f"{base_url}{record_path(n)}",
            headers={"API-Key": api_key, "X-App-Token": app_token, "Accept": "application/json"},
        )
    if res.status_code == 404:
        return NOT_FOUND
    res.raise_for_status()
    return res.json()


async def tikkie_notification(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: parse, validate and subscriptionId-check a notification."""
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    try:
        notification = parse_notification(body)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    if not check_subscription_id(notification["subscriptionId"]):
        logger.warning("Rejected unknown subscriptionId %s", notification["subscriptionId"])
        raise HTTPException(status_code=403, detail="Unknown subscriptionId")
    return notification


app = FastAPI()


@app.post("/webhooks/tikkie")
async def tikkie_webhook(notification: Dict[str, Any] = Depends(tikkie_notification)):
    ntype = notification["notificationType"]
    if ntype not in NOTIFICATION_TYPES:
        logger.info("Ignoring unknown notificationType: %s", ntype)
        return {"received": True}

    # The notification has no amount or status — confirm against the API first.
    try:
        record = await fetch_record(notification)
    except httpx.HTTPError as err:
        logger.error("Failed to fetch record from Tikkie API: %s", err)
        raise HTTPException(status_code=502, detail="Could not confirm notification")
    if record is NOT_FOUND:
        raise HTTPException(status_code=403, detail="Notification could not be confirmed")
    if record is None:
        logger.warning(
            "TIKKIE_API_KEY / TIKKIE_APP_TOKEN not set — skipping re-fetch (do not fulfil in production)"
        )

    # Tikkie retries (up to three attempts) — dedupe on paymentToken (PAYMENT),
    # refundToken (REFUND) or bundleId (BUNDLE).
    if ntype == "PAYMENT":
        print(f"Payment {notification['paymentToken']} on request {notification['paymentRequestToken']}", record or "")
        # TODO: mark the order paid using record["amountInCents"]
    elif ntype == "REFUND":
        print(f"Refund {notification['refundToken']} for payment {notification['paymentToken']}", record or "")
        # TODO: record the refund (record["status"] is PENDING | PAID)
    elif ntype == "BUNDLE":
        print(f"Transaction bundle {notification['bundleId']} available", record or "")
        # TODO: download / reconcile the bundled payout

    return {"received": True}


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
