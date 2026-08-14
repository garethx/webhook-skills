# Generated with: aircall-webhooks skill
# https://github.com/hookdeck/webhook-skills

import logging
import os
import secrets
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    # python-dotenv is optional; env vars can be set directly.
    pass


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Aircall Webhook Handler")


def verify_aircall_webhook(
    payload_token: Optional[str], expected_token: Optional[str]
) -> bool:
    """Verify an Aircall webhook.

    Aircall does NOT sign webhooks — there is no signature header and no HMAC.
    Every payload carries a top-level ``token`` string equal to the token issued
    when the webhook was created (POST /v1/webhooks -> webhook.token).

    Compare it with ``secrets.compare_digest`` so the token can't be recovered
    via timing. Unlike ``hmac.compare_digest`` on bytes, this handles differing
    lengths without raising.

    Because the secret lives inside the JSON body, the raw body is NOT needed —
    parsing before verifying is safe here (it is not for HMAC providers).
    """
    if not payload_token or not expected_token:
        return False
    if not isinstance(payload_token, str):
        return False
    return secrets.compare_digest(payload_token, expected_token)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/aircall")
async def handle_aircall_webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        payload = await request.json()
    except Exception as exc:  # noqa: BLE001 - any parse failure is a 400
        logger.error("Failed to parse JSON: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    resource = payload.get("resource")
    event = payload.get("event")
    timestamp = payload.get("timestamp")
    token = payload.get("token")
    data = payload.get("data") or {}

    # 1. Verify BEFORE anything else.
    if not verify_aircall_webhook(token, os.getenv("AIRCALL_WEBHOOK_TOKEN")):
        logger.error("Aircall webhook verification failed")
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 2. Validate the envelope. Aircall always sends
    #    resource / event / timestamp / token / data.
    if not event or not isinstance(event, str):
        raise HTTPException(status_code=400, detail="Missing event")

    logger.info("✓ Verified Aircall webhook: %s", event)
    logger.info("  resource=%s timestamp=%s", resource, timestamp)

    # 3. Process in the background and return 200 immediately — Aircall times out
    #    after 5 seconds, and a timeout or non-2xx counts toward the 50 failures
    #    that auto-disable the webhook.
    #    Delivery is at-least-once and unordered, so handling must be idempotent.
    background_tasks.add_task(handle_event, event, data, resource)

    return JSONResponse(status_code=200, content={"received": True, "event": event})


def handle_event(event: str, data: Dict[str, Any], resource: Optional[str]) -> None:
    """Dispatch on the event name.

    Switch on ``event`` rather than ``resource``: ``resource`` was originally
    documented as number/user/contact/call, and newer event families (message,
    analytics, ai_voice_agent, conversation_intelligence) added values later.
    """
    try:
        # Call events — MANY fire per call. Aircall recommends upserting on call.id.
        if event.startswith("call."):
            return handle_call_event(event, data)

        # Message events (SMS / MMS / WhatsApp). Native messaging mode only —
        # numbers in Proxy mode post to a configured callbackUrl instead.
        if event.startswith("message.") or event.startswith("group_message."):
            return handle_message_event(event, data)

        # User events. Prefer the .v2 variants — V1 is deprecated.
        if event.startswith("user."):
            return handle_user_event(event, data)

        if event in ("number.created", "number.deleted"):
            logger.info(
                "📞 Number %s: %s (%s)",
                event.split(".")[1],
                data.get("name"),
                data.get("digits"),
            )

        elif event in ("number.opened", "number.closed"):
            # Business hours transition
            logger.info(
                "🕒 Number %s is now %s (%s)",
                data.get("name"),
                "open" if data.get("open") else "closed",
                data.get("time_zone"),
            )

        elif event in ("contact.created", "contact.updated", "contact.deleted"):
            # Contact payloads use UTC strings for created_at / updated_at
            logger.info(
                "👤 Contact %s: %s %s (id=%s)",
                event.split(".")[1],
                data.get("first_name", ""),
                data.get("last_name", ""),
                data.get("id"),
            )

        elif event == "integration.deleted":
            # OAuth integrations only — mirror the uninstall on your side.
            logger.info(
                "🔌 Integration %s deleted for company %s",
                data.get("integration_id"),
                data.get("company_id"),
            )

        # Conversation Intelligence (some require the AI Assist add-on)
        elif event in (
            "transcription.created",
            "summary.created",
            "topics.created",
            "sentiment.created",
            "action_item.created",
            "playbook_result.created",
            "playbook_result.updated",
            "realtime_transcription.utterances_received",
            "custom_summary.result_created",
            "custom_summary.result_updated",
            "call_evaluation.created",
            "call_evaluation.updated",
        ):
            logger.info(
                "🧠 Conversation intelligence: %s (call_id=%s)",
                event,
                data.get("call_id", data.get("id")),
            )

        elif event in (
            "ai_voice_agent.started",
            "ai_voice_agent.ended",
            "ai_voice_agent.escalated",
            "ai_voice_agent.summary",
        ):
            logger.info("🤖 AI voice agent: %s", event)

        elif event == "analytics.report_created":
            logger.info(
                "📊 Analytics report ready%s",
                " (download URL issued)" if data.get("download_url") else "",
            )

        elif event == "analytics.report_failed":
            logger.error("📊 Analytics report failed")

        else:
            # Forward-compatibility: log unknown events rather than failing.
            logger.info(
                '❓ Unhandled Aircall event "%s" (resource=%s)', event, resource
            )
    except Exception:  # noqa: BLE001
        # Never let a handler error escape — the 200 has already been sent, and
        # raising here would only produce noise.
        logger.exception("Error handling %s", event)


def handle_call_event(event: str, data: Dict[str, Any]) -> None:
    # Upsert key — the same call id appears across its whole lifecycle.
    call_id = data.get("id")
    user_name = (data.get("user") or {}).get("name", "unknown")

    if event == "call.created":
        logger.info(
            "📲 Call %s created (%s) from %s — uuid=%s",
            call_id,
            data.get("direction"),
            data.get("raw_digits"),
            data.get("call_uuid"),
        )

    elif event == "call.ringing_on_agent":
        logger.info("🔔 Call %s ringing on agent %s", call_id, user_name)

    elif event == "call.agent_declined":
        logger.info("🚫 Call %s declined by %s", call_id, user_name)

    elif event == "call.answered":
        logger.info("✅ Call %s answered at %s", call_id, data.get("answered_at"))

    elif event in ("call.hold", "call.unhold"):
        logger.info(
            "⏸️  Call %s %s", call_id, "on hold" if event == "call.hold" else "resumed"
        )

    elif event in ("call.transferred", "call.external_transferred"):
        logger.info("↪️  Call %s transferred (%s)", call_id, event)

    elif event == "call.unsuccessful_transfer":
        logger.info("⚠️  Call %s transfer failed", call_id)

    elif event == "call.hungup":
        logger.info("📴 Call %s hung up — cause=%s", call_id, data.get("hangup_cause"))

    elif event == "call.ended":
        logger.info(
            "🏁 Call %s ended — duration=%ss cost=%s missed=%s",
            call_id,
            data.get("duration"),
            data.get("cost"),
            data.get("missed_call_reason") or "no",
        )

    elif event == "call.voicemail_left":
        logger.info(
            "📼 Voicemail left on call %s: %s",
            call_id,
            data.get("voicemail_short_url", ""),
        )

    elif event == "call.comm_assets_generated":
        logger.info(
            "🎙️  Assets ready for call %s: recording=%s",
            call_id,
            data.get("recording") or "none",
        )

    elif event == "call.ivr_option_selected":
        logger.info("☎️  IVR option selected on call %s", call_id)

    elif event == "call.assigned":
        logger.info("📌 Call %s assigned to %s", call_id, user_name)

    elif event == "call.archived":
        logger.info("🗄️  Call %s archived", call_id)

    elif event in ("call.tagged", "call.untagged"):
        tags = ", ".join(t.get("name", "") for t in (data.get("tags") or [])) or "(none)"
        logger.info(
            "🏷️  Call %s %s: %s",
            call_id,
            "tagged" if event == "call.tagged" else "untagged",
            tags,
        )

    elif event == "call.commented":
        logger.info("💬 Comment added to call %s", call_id)

    else:
        logger.info('❓ Unhandled call event "%s" for call %s', event, call_id)


def handle_message_event(event: str, data: Dict[str, Any]) -> None:
    # `channel` is null for SMS/MMS, "whatsapp" for WhatsApp.
    channel = data.get("channel") or "sms/mms"

    if event == "message.sent":
        logger.info("📤 Message %s sent via %s", data.get("id"), channel)

    elif event == "message.received":
        logger.info(
            '📥 Message %s received via %s: "%s"',
            data.get("id"),
            channel,
            data.get("body", ""),
        )

    elif event == "message.status_updated":
        logger.info("📬 Message %s status: %s", data.get("id"), data.get("status"))

    elif event == "group_message.sent":
        logger.info(
            "📤 Group message %s sent to conversation %s (%d participants)",
            data.get("id"),
            data.get("group_conversation_id"),
            len(data.get("participants") or []),
        )

    elif event == "group_message.received":
        logger.info(
            "📥 Group message %s received from %s in %s",
            data.get("id"),
            data.get("external_number"),
            data.get("group_conversation_id"),
        )

    elif event == "group_message.status_updated":
        logger.info("📬 Group message %s status: %s", data.get("id"), data.get("status"))

    else:
        logger.info('❓ Unhandled message event "%s"', event)


def handle_user_event(event: str, data: Dict[str, Any]) -> None:
    # Strip the ".v2" suffix so V1 and V2 share handling. Use V2 in new
    # integrations — Aircall has deprecated the V1 user events.
    is_v2 = event.endswith(".v2")
    base = event[: -len(".v2")] if is_v2 else event
    who = data.get("name") or data.get("email") or f"user {data.get('id')}"

    if base == "user.created":
        logger.info("👋 User created: %s%s", who, "" if is_v2 else " (V1 — migrate to .v2)")

    elif base == "user.deleted":
        logger.info("👋 User deleted: %s", who)

    elif base == "user.connected":
        logger.info("🟢 %s opened Aircall Workspace", who)

    elif base == "user.disconnected":
        logger.info("⚪ %s closed Aircall Workspace", who)

    elif base == "user.opened":
        logger.info("🟢 %s is available", who)

    elif base == "user.closed":
        # Heads-up: with substatus enabled, TWO user.closed events arrive —
        # one with availability_status only, one with the selected substatus.
        # They are not duplicates.
        logger.info(
            "🔴 %s is unavailable (status=%s, substatus=%s)",
            who,
            data.get("availability_status", "?"),
            data.get("substatus", "n/a"),
        )

    elif base == "user.wut_start":
        logger.info("⏱️  %s started wrap-up time", who)

    elif base == "user.wut_end":
        logger.info("⏱️  %s finished wrap-up time", who)

    else:
        logger.info('❓ Unhandled user event "%s"', event)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    logger.info("Aircall webhook server starting on port %s", port)
    logger.info("Webhook endpoint: POST http://localhost:%s/webhooks/aircall", port)
    if not os.getenv("AIRCALL_WEBHOOK_TOKEN"):
        logger.warning("⚠️  Warning: AIRCALL_WEBHOOK_TOKEN not set")
    uvicorn.run(app, host="0.0.0.0", port=port)
