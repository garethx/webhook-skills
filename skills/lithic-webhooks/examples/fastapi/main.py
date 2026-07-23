# Generated with: lithic-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from lithic import Lithic

load_dotenv()

app = FastAPI()

# Lithic webhooks implement the Standard Webhooks spec (powered by Svix).
# `client.webhooks.unwrap(body, headers, secret=...)` verifies the
# `webhook-signature` HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{body}`,
# enforces a ~5-minute timestamp tolerance, and returns the parsed event.
# Signature verification needs the optional `standardwebhooks` dependency
# (installed via `pip install "lithic[webhooks]"` or the requirements file).
#
# The API key is only used to call the Lithic API; a placeholder keeps the
# client constructable for a receive-only endpoint.
client = Lithic(api_key=os.environ.get("LITHIC_API_KEY", "placeholder-not-used-for-webhooks"))


def get_event_type(event) -> str | None:
    """Read `event_type` whether unwrap returns a model or a mapping."""
    if isinstance(event, dict):
        return event.get("event_type")
    return getattr(event, "event_type", None)


@app.post("/webhooks/lithic")
async def lithic_webhook(request: Request):
    # Read the RAW body — verification must run against the exact bytes signed.
    raw_body = await request.body()
    secret = os.environ.get("LITHIC_WEBHOOK_SECRET")

    try:
        event = client.webhooks.unwrap(raw_body, request.headers, secret=secret)
    except Exception as err:  # noqa: BLE001 - any failure means the request is not trusted
        print(f"Lithic webhook verification failed: {err}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Lithic event objects carry an `event_type` (resource.action) field.
    event_type = get_event_type(event)

    if event_type == "card.created":
        print("Card created")
        # TODO: Provision the new card in your system
    elif event_type == "card.updated":
        print("Card updated")
        # TODO: Sync card state (e.g. PAUSED/CLOSED)
    elif event_type == "card_transaction.updated":
        print("Card transaction updated")
        # TODO: Reconcile authorization / clearing state
    elif event_type == "payment_transaction.created":
        print("Payment transaction created")
        # TODO: Record incoming ACH / wire payment
    elif event_type == "payment_transaction.updated":
        print("Payment transaction updated")
        # TODO: Update payment status (settled, returned)
    elif event_type == "dispute.updated":
        print("Dispute updated")
        # TODO: Progress the dispute workflow
    elif event_type == "balance.updated":
        print("Balance updated")
        # TODO: Refresh cached balances
    elif event_type == "three_ds_authentication.created":
        print("3DS authentication created")
        # TODO: Handle challenge / decisioning
    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge quickly so Lithic does not retry.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
