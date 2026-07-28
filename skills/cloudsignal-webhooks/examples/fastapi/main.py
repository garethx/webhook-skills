# Generated with: cloudsignal-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

load_dotenv()

app = FastAPI(title="CloudSignal Webhook Handler")

# The nine CloudSignal Webhooks v2.0 signal types (case-sensitive, PascalCase).
KNOWN_EVENT_TYPES = [
    "CloudprinterOrderValidated",
    "ItemValidated",
    "ItemProduce",
    "ItemProduced",
    "ItemPacked",
    "ItemShipped",
    "ItemError",
    "ItemCanceled",
    "CloudprinterOrderCanceled",
]


def verify_api_key(provided_key: Optional[str], expected_key: Optional[str]) -> bool:
    """
    Verify a CloudSignal webhook.

    CloudSignal has NO signature header/HMAC. Authenticity is established by the
    plaintext ``apikey`` field in the JSON body matching the per-endpoint Webhook
    API key you configured. Compare it with a timing-safe comparison.
    """
    if not provided_key or not expected_key:
        return False
    return hmac.compare_digest(provided_key, expected_key)


@app.post("/webhooks/cloudsignal")
async def handle_cloudsignal_webhook(signal: Dict[str, Any]):
    """Handle CloudSignal (Cloudprinter.com) order/item status signals.

    The ``apikey`` we authenticate against lives INSIDE the parsed JSON body,
    so ordinary JSON parsing is safe (there is no body signature to protect).
    """
    expected_key = os.getenv("CLOUDSIGNAL_WEBHOOK_APIKEY")

    # Authenticate: the per-endpoint Webhook API key is carried in the body.
    if not verify_api_key(signal.get("apikey"), expected_key):
        print("CloudSignal webhook authentication failed: apikey mismatch")
        raise HTTPException(status_code=401, detail="Unauthorized")

    signal_type = signal.get("type")
    order = signal.get("order")
    item = signal.get("item")
    order_reference = signal.get("order_reference")
    item_reference = signal.get("item_reference")

    print(
        f"Received CloudSignal {signal_type} "
        f"(order {order}, order_reference {order_reference})"
    )

    # Dispatch on the signal `type`.
    if signal_type == "CloudprinterOrderValidated":
        print(f"Order validated: {order} {order_reference}")

    elif signal_type == "ItemValidated":
        print(f"Item validated: {item} {item_reference}")

    elif signal_type == "ItemProduce":
        print(f"Item production started: {item} {item_reference}")

    elif signal_type == "ItemProduced":
        print(f"Item produced: {item} {item_reference}")

    elif signal_type == "ItemPacked":
        print(f"Item packed: {item} {item_reference}")

    elif signal_type == "ItemShipped":
        # Type-specific fields: tracking, shipping_option.
        print(
            f"Item shipped: {item} tracking: {signal.get('tracking')} "
            f"shipping_option: {signal.get('shipping_option')}"
        )
        # TODO: Store the tracking number, notify the customer.

    elif signal_type == "ItemError":
        # Type-specific field: cause (optional).
        print(f"Item error: {item} cause: {signal.get('cause')}")
        # TODO: Alert your team, reprint, or refund.

    elif signal_type == "ItemCanceled":
        # Type-specific field: cause (optional).
        print(f"Item canceled: {item} cause: {signal.get('cause')}")

    elif signal_type == "CloudprinterOrderCanceled":
        print(f"Order canceled: {order} {order_reference}")

    else:
        # Unknown/new type: acknowledge with 200 so CloudSignal does not retry.
        print(f"Unhandled CloudSignal type: {signal_type}")

    # Respond 200 quickly. Any non-2xx makes CloudSignal retry the signal (up to
    # 100 attempts over 7 days).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
