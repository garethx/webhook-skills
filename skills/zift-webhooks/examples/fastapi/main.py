# Generated with: zift-webhooks skill
# https://github.com/hookdeck/webhook-skills
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI(title="Zift Webhook Handler")


def ack_body(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build the Zift acknowledgement body.

    Zift notifications have NO signature/HMAC header — there is nothing to
    cryptographically verify. Instead, an endpoint acknowledges a delivery by
    echoing the received ``notificationId`` back in the JSON response body. Zift
    accepts the id as an int or a string; pass it straight through so the echoed
    value matches what was received.

    Returning "OK", an empty body, or {"received": true} is NOT an
    acknowledgement — Zift retries at +5m, +15m, +60m, +24h, then marks the
    notification "Failed".
    """
    return {"notificationId": payload.get("notificationId")}


def event_category(event_code: Any) -> str:
    """
    Classify a notification by its eventCode prefix.

    eventCode is ``category.entity-action``, e.g. "billing.subscription-created"
    or "processing.chargeback". Dispatching on the prefix is robust even if a
    specific suffix differs from the documented examples — confirm exact literals
    with Zift support at onboarding.
    """
    if not isinstance(event_code, str):
        return "unknown"
    category = event_code.split(".")[0]
    return category if category in ("billing", "processing") else "unknown"


@app.post("/webhooks/zift")
async def handle_zift_webhook(payload: Dict[str, Any]):
    """Handle a Zift notification and acknowledge by echoing notificationId."""
    # Without a notificationId we cannot acknowledge the delivery. Surface the
    # misdelivery with a 400 rather than silently returning 200.
    notification_id = payload.get("notificationId")
    if notification_id is None:
        print("Zift notification missing notificationId")
        return JSONResponse(status_code=400, content={"error": "Missing notificationId"})

    category = event_category(payload.get("eventCode"))

    print(
        f"Received Zift notification {notification_id} ({payload.get('eventCode')})"
    )

    # Dispatch on the event category, then branch on the specific eventCode.
    # Make handling idempotent — a retry may redeliver a notification you already
    # processed (dedupe on notificationId before side effects).
    if category == "billing":
        print(f"Billing event: {payload.get('eventCode')} dataType: {payload.get('dataType')}")
        # TODO: update subscription / payment option / allocation records.

    elif category == "processing":
        print(f"Processing event: {payload.get('eventCode')} dataType: {payload.get('dataType')}")
        # TODO: handle chargeback / return / reversal / NOC (ACH detail in data).

    else:
        print(f"Unhandled eventCode: {payload.get('eventCode')}")

    # Acknowledge by echoing the notificationId. THIS is the ack.
    return ack_body(payload)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
