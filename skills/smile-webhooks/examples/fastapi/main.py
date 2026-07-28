# Generated with: smile-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from fastapi import FastAPI, Request, Response

app = FastAPI()

WEBHOOK_SECRET = os.environ.get("SMILE_WEBHOOK_SECRET", "")


def verify_smile_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify the ``Smile-Signature`` header.

    Smile signs the RAW request body with HMAC-SHA512 (hex), keyed with the
    per-endpoint secret you set at registration. We recompute the digest and
    compare in constant time. Never sign a re-serialized parsed body — the bytes
    (and therefore the signature) would differ.
    """
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")


def handle_event(event: dict) -> None:
    """Dispatch on the ``type`` field of the JSON body."""
    event_type = event.get("type")
    event_id = event.get("id")
    data = event.get("data") or {}

    if event_type == "ACCOUNT_CONNECTED":
        print(f"Account connected: {data.get('accountId')}")
        # TODO: kick off data collection, update UI.
    elif event_type == "ACCOUNT_DISCONNECTED":
        print(f"Account disconnected: {data.get('accountId')}")
        # TODO: stop syncing, notify the user.
    elif event_type == "TASK_FINISHED":
        print(f"Task finished: {event_id}")
        # TODO: pull results (or read inlined data if includePayload is on).
    elif event_type == "IDENTITY_ADDED":
        print(f"Identity added: {data.get('userId')}")
        # TODO: populate KYC / profile fields.
    elif event_type == "INCOMES_ADDED":
        print(f"Incomes added: {data.get('userId')}")
        # TODO: income verification / affordability.
    elif event_type == "EMPLOYMENTS_ADDED":
        print(f"Employments added: {data.get('userId')}")
        # TODO: employment verification.
    elif event_type == "RECORD_COMPLETED":
        print(f"Record completed: {event_id}")
        # TODO: finalize the application.
    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/smile")
async def smile_webhook(request: Request) -> Response:
    # Raw bytes so the signature is computed over the exact bytes Smile sent.
    raw_body = await request.body()
    signature = request.headers.get("Smile-Signature")

    # 1) Require the signature header.
    if not signature:
        return Response(
            content=json.dumps({"error": "Missing Smile-Signature header"}),
            media_type="application/json",
            status_code=400,
        )

    # 2) Verify the signature over the raw body (the real gate).
    if not verify_smile_signature(raw_body, signature, WEBHOOK_SECRET):
        return Response(
            content=json.dumps({"error": "Invalid signature"}),
            media_type="application/json",
            status_code=400,
        )

    # 3) Parse only AFTER the signature check passes.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(
            content=json.dumps({"error": "Invalid JSON"}),
            media_type="application/json",
            status_code=400,
        )

    # 4) Handle the event. Dedupe on event["id"] — Smile retries up to 2 times.
    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Handler error: {err}")
        return Response(
            content=json.dumps({"error": "Handler error"}),
            media_type="application/json",
            status_code=500,
        )

    # 5) Acknowledge with 2xx so Smile does not retry.
    return Response(
        content=json.dumps({"received": True}),
        media_type="application/json",
        status_code=200,
    )
