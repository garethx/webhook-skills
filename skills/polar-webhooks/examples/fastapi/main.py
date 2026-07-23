# Generated with: polar-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from polar_sdk.webhooks import (
    validate_event,
    WebhookVerificationError,
    WebhookUnknownTypeError,
)

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("POLAR_WEBHOOK_SECRET", "")


@app.post("/webhooks/polar")
async def polar_webhook(request: Request):
    # Read the RAW body — signature verification must run on the exact bytes.
    payload = await request.body()

    try:
        # validate_event verifies the Standard Webhooks signature AND parses the
        # payload into a typed event. Pass the secret as-is — the SDK base64-encodes
        # it. `request.headers` carries webhook-id / webhook-timestamp / webhook-signature.
        event = validate_event(
            body=payload,
            headers=dict(request.headers),
            secret=webhook_secret,
        )
    except WebhookVerificationError:
        # Signature check failed -> the request is not from Polar. Reject it.
        return Response(content="Invalid signature", status_code=400)
    except WebhookUnknownTypeError as exc:
        # Signature was valid, but the event type is newer than this SDK version
        # (the SDK documents this as safe to ignore). The event IS authentic, so
        # acknowledge it with a 2xx — an error would make Polar retry and, after 10
        # consecutive failures, auto-disable the endpoint.
        print(f"Received a valid webhook with an unknown type: {exc}")
        return Response(content="Accepted", status_code=202)

    # Handle the event based on its type. `event.data` is the resource itself
    # (an Order, Subscription, Customer, etc.).
    if event.TYPE == "checkout.updated":
        print(f"Checkout updated: {event.data.id}")
        # TODO: track conversion, react to a confirmed checkout

    elif event.TYPE == "order.created":
        print(f"Order created: {event.data.id}")
        # TODO: record the order (check event.data.billing_reason)

    elif event.TYPE == "order.paid":
        print(f"Order paid: {event.data.id}")
        # TODO: fulfill the purchase, grant access, send a receipt

    elif event.TYPE == "order.refunded":
        print(f"Order refunded: {event.data.id}")
        # TODO: reverse fulfillment, update accounting

    elif event.TYPE == "subscription.created":
        print(f"Subscription created: {event.data.id}")
        # TODO: provision access, send a welcome email

    elif event.TYPE == "subscription.canceled":
        print(f"Subscription canceled (cancels at period end): {event.data.id}")
        # TODO: schedule retention, mark pending cancellation

    elif event.TYPE == "subscription.revoked":
        print(f"Subscription revoked: {event.data.id}")
        # TODO: revoke access to paid features

    elif event.TYPE == "customer.state_changed":
        print(f"Customer state changed: {event.data.id}")
        # TODO: sync entitlements from the customer state

    else:
        print(f"Unhandled event type: {event.TYPE}")

    # Respond fast (Polar times out at 10s) to acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
