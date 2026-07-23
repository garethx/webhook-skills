# Generated with: microsoft-graph-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hmac
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()


def verify_client_state(received: str | None, expected: str | None) -> bool:
    """Verify the clientState echoed on a Microsoft Graph notification.

    Graph does NOT sign notifications with an HMAC. The opaque ``clientState`` you
    set when creating the subscription is echoed on every notification. Compare it
    (timing-safe) to your stored secret.
    """
    if not received or not expected:
        return False
    return hmac.compare_digest(received, expected)


def handle_change_notification(notification: dict) -> None:
    """Handle a change notification (created / updated / deleted)."""
    change_type = notification.get("changeType")
    resource = notification.get("resource")
    subscription_id = notification.get("subscriptionId")
    resource_id = (notification.get("resourceData") or {}).get("id")

    print(f"Received {change_type} for {resource} (subscription: {subscription_id})")

    if change_type == "created":
        print(f"Resource created: {resource_id}")
        # TODO: Fetch the full resource from Graph, or use rich notifications
    elif change_type == "updated":
        print(f"Resource updated: {resource_id}")
        # TODO: Re-fetch and reconcile
    elif change_type == "deleted":
        print(f"Resource deleted: {resource_id}")
        # TODO: Remove local copy
    else:
        print(f"Unhandled changeType: {change_type}")


def handle_lifecycle_event(notification: dict) -> None:
    """Handle a lifecycle notification (delivered to lifecycleNotificationUrl)."""
    lifecycle_event = notification.get("lifecycleEvent")
    subscription_id = notification.get("subscriptionId")

    print(f"Lifecycle event {lifecycle_event} for subscription {subscription_id}")

    if lifecycle_event == "reauthorizationRequired":
        print("Reauthorize/renew the subscription (POST /reauthorize or PATCH expirationDateTime)")
        # TODO: Reauthorize and/or renew the subscription
    elif lifecycle_event == "subscriptionRemoved":
        print("Subscription removed — recreate it and resync via delta query")
        # TODO: Recreate subscription, then delta-sync missed changes
    elif lifecycle_event == "missed":
        print("Missed notifications — resync via delta query")
        # TODO: Delta-sync to recover missed changes
    else:
        print(f"Unhandled lifecycleEvent: {lifecycle_event}")


@app.post("/webhooks/microsoft-graph")
async def microsoft_graph_webhook(request: Request):
    # 1) Endpoint validation handshake.
    #    On subscription create/renewal Graph sends ?validationToken=... and
    #    expects the URL-decoded token echoed back as text/plain, 200, within 10s.
    #    Starlette query params are already URL-decoded.
    validation_token = request.query_params.get("validationToken")
    if validation_token is not None:
        return PlainTextResponse(validation_token, status_code=200)

    try:
        payload = await request.json()
    except Exception:
        return PlainTextResponse("Invalid JSON", status_code=400)

    notifications = payload.get("value") if isinstance(payload, dict) else None
    if not isinstance(notifications, list):
        notifications = []

    expected = os.environ.get("MICROSOFT_GRAPH_CLIENT_STATE")

    # Validate clientState on every item before processing any of them.
    for notification in notifications:
        if not verify_client_state(notification.get("clientState"), expected):
            print("clientState mismatch — rejecting notification batch")
            return PlainTextResponse("Invalid clientState", status_code=400)

    for notification in notifications:
        if notification.get("lifecycleEvent"):
            handle_lifecycle_event(notification)
        else:
            handle_change_notification(notification)

    # Acknowledge within 3 seconds. Return 202 and do heavy work asynchronously.
    return Response(status_code=202)


@app.get("/health")
async def health():
    return JSONResponse({"status": "ok"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
