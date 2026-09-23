# Generated with: quo-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Quo (formerly OpenPhone) webhook receiver.

QUO HAS TWO WEBHOOK GENERATIONS WITH TWO DIFFERENT SIGNATURE SCHEMES.

Which one an endpoint receives is decided by how the subscription was created,
not by anything configured here -- so a handler that may receive both must
implement both. They are NOT interchangeable.

  Scheme A (current, Quo-Api-Version: 2026-03-30)
    headers : webhook-id / webhook-timestamp / webhook-signature
    signs   : {webhook-id}.{webhook-timestamp}.{raw-body}
    ts unit : UNIX SECONDS
    secret  : whsec_<base64>  -> strip prefix, then base64-decode

  Scheme B (legacy v1, the OpenPhone-era scheme)
    header  : openphone-signature  (NOT renamed in the Quo rebrand)
    format  : hmac;1;<timestamp>;<base64sig>
    signs   : {timestamp}.{raw-body}
    ts unit : UNIX MILLISECONDS (inferred from the documented example)
    secret  : bare base64        -> base64-decode

Both are HMAC-SHA256 with a STANDARD base64 digest (not base64url, not hex),
and both sign the RAW, UNPARSED request body bytes.

Quo publishes no SDK. Its docs recommend Svix for Scheme A and Svix does work
there unchanged -- but Svix cannot verify Scheme B at all. Since the legacy path
has to be hand-written regardless, this example uses one manual crypto path for
both: no dependency, and the algorithm stays visible.

Not Quoter (the CPQ company, MD5 `hash` form field). Different company.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Mapping, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request, Response, status

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("quo-webhooks")

app = FastAPI(title="Quo Webhooks")

# Replay window for BOTH schemes. Quo's own signature-validation example uses
# 5 minutes for the current scheme; the same window is reasonable for legacy.
MAX_AGE_SECONDS = int(os.environ.get("QUO_MAX_AGE_SECONDS", "300"))


def verify_quo_signature(
    raw_body: bytes,
    headers: Mapping[str, str],
    key: Optional[str],
    max_age_seconds: int = MAX_AGE_SECONDS,
) -> bool:
    """Verify a Scheme A (current) Quo delivery.

    Args:
        raw_body: RAW, unparsed request body bytes.
        headers: Request headers (case-insensitive lookup).
        key: QUO_WEBHOOK_KEY -- the ``whsec_...`` value exactly as stored.
    """
    webhook_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature = headers.get("webhook-signature")

    # Fail closed: a missing header or an unconfigured key is a rejection.
    if not (webhook_id and timestamp and signature and key):
        return False

    # webhook-timestamp is UNIX SECONDS, so a real staleness check is possible.
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(int(time.time()) - ts) > max_age_seconds:
        return False

    # The whsec_ prefix is NOT part of the key. Strip it, then base64-DECODE the
    # remainder to raw bytes. Passing the whsec_ string straight into hmac.new
    # is the single most common Scheme A bug; only the Svix SDK accepts it.
    try:
        secret = base64.b64decode(key[len("whsec_") :] if key.startswith("whsec_") else key)
    except (binascii.Error, ValueError):
        return False

    # Concatenate onto the RAW BODY BYTES -- never onto re-serialized JSON.
    signed_content = f"{webhook_id}.{timestamp}.".encode("utf-8") + raw_body
    expected = base64.b64encode(
        hmac.new(secret, signed_content, hashlib.sha256).digest()
    ).decode("ascii")

    # webhook-signature is a SPACE-separated list of `v1,<base64sig>` entries.
    # Accept if ANY v1 entry matches, so secret rotation keeps working.
    for entry in signature.split(" "):
        version, _, provided = entry.strip().partition(",")
        if version != "v1" or not provided:
            continue
        # compare_digest is constant-time and safe on differing lengths; both
        # sides are base64, hence ASCII, so no TypeError risk.
        if hmac.compare_digest(provided, expected):
            return True
    return False


def verify_quo_legacy_signature(
    raw_body: bytes,
    header: Optional[str],
    signing_secret: Optional[str],
    max_age_seconds: int = MAX_AGE_SECONDS,
) -> bool:
    """Verify a Scheme B (legacy ``openphone-signature``) Quo delivery.

    Args:
        raw_body: RAW, unparsed request body bytes.
        header: The ``openphone-signature`` header value.
        signing_secret: QUO_LEGACY_SIGNING_SECRET (bare base64, no prefix).
    """
    if not header or not signing_secret:
        return False  # fail closed

    # The legacy signing secret is BASE64 with no prefix -- decode to raw bytes.
    try:
        key = base64.b64decode(signing_secret)
    except (binascii.Error, ValueError):
        return False

    # Quo: "Future versions may include multiple signatures separated by
    # commas." Note the separator is a COMMA here -- Scheme A uses a SPACE.
    for part in header.split(","):
        fields = part.strip().split(";")
        # <scheme>;<version>;<timestamp>;<signature> -- exactly 4 fields.
        if len(fields) != 4:
            continue
        scheme, version, timestamp, provided = fields
        if scheme != "hmac" or version != "1" or not timestamp or not provided:
            continue
        if not is_fresh_legacy_timestamp(timestamp, max_age_seconds):
            continue

        # TWO parts -- no webhook id, unlike Scheme A.
        signed_content = f"{timestamp}.".encode("utf-8") + raw_body
        expected = base64.b64encode(
            hmac.new(key, signed_content, hashlib.sha256).digest()
        ).decode("ascii")
        if hmac.compare_digest(provided, expected):
            return True
    return False


def is_fresh_legacy_timestamp(timestamp: str, max_age_seconds: int) -> bool:
    """Legacy timestamps are UNIX MILLISECONDS.

    The documented example value is ``1639710054089`` -- 13 digits. Treating
    that as seconds puts every delivery ~52,000 years in the future and
    silently drops all traffic.

    Quo's docs never state the unit in words, so this detects it by digit count
    rather than hardcoding a divisor: correct whichever unit arrives.
    """
    try:
        n = int(timestamp)
    except (TypeError, ValueError):
        return False
    if n <= 0:
        return False
    ms = n if len(str(n)) >= 12 else n * 1000
    return abs(time.time() * 1000 - ms) <= max_age_seconds * 1000


def normalize_event(event: Mapping[str, Any]) -> dict:
    """Flatten the two envelope generations into one shape.

    Current (apiVersion "2026-03-30"): data.resource + data.context + data.links
    Legacy  (apiVersion "v2" / "v3"):  data.object

    Field names differ too: legacy uses ``body``/``from``/``to``; current uses
    ``resource.text`` and ``context.senderIdentifier`` /
    ``context.recipientIdentifiers``.
    """
    data = event.get("data") or {}
    is_legacy = "object" in data
    return {
        "type": event.get("type"),
        "api_version": event.get("apiVersion"),
        "is_legacy": is_legacy,
        "resource": (data.get("object") if is_legacy else data.get("resource")) or {},
        "context": ({} if is_legacy else data.get("context")) or {},
        "links": ({} if is_legacy else data.get("links")) or {},
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/quo")
async def quo_webhook(request: Request, background_tasks: BackgroundTasks):
    # Read the RAW bytes first. Quo's docs: "If your middleware parses or
    # rewrites the JSON body first, verification will fail." Never call
    # await request.json() before verifying.
    raw_body = await request.body()

    # Starlette headers are case-insensitive, and Quo documents these lowercase.
    headers = request.headers
    has_current_headers = all(
        headers.get(name)
        for name in ("webhook-id", "webhook-timestamp", "webhook-signature")
    )
    legacy_header = headers.get("openphone-signature")

    if not has_current_headers and not legacy_header:
        # Quo sends no unsigned requests. There is NO handshake, NO challenge
        # and NO webhook.test event -- "Send Test Request" is an ordinary
        # signed delivery. An unsigned request is not from Quo.
        logger.error("No Quo signature headers present")
        return Response(
            content=json.dumps({"error": "Missing signature headers"}),
            media_type="application/json",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if has_current_headers:
        scheme = "current"
        key = os.environ.get("QUO_WEBHOOK_KEY")
        # FAIL CLOSED on misconfiguration, with 500 (not 400) so an operator can
        # tell "my server is misconfigured" apart from "bad signature".
        if not key:
            logger.error("QUO_WEBHOOK_KEY is not set -- refusing unverified webhooks")
            return Response(
                content=json.dumps({"error": "Webhook secret not configured"}),
                media_type="application/json",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        verified = verify_quo_signature(raw_body, headers, key)
    else:
        scheme = "legacy"
        secret = os.environ.get("QUO_LEGACY_SIGNING_SECRET")
        if not secret:
            logger.error(
                "QUO_LEGACY_SIGNING_SECRET is not set -- refusing unverified webhooks"
            )
            return Response(
                content=json.dumps({"error": "Webhook secret not configured"}),
                media_type="application/json",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        verified = verify_quo_legacy_signature(raw_body, legacy_header, secret)

    if not verified:
        logger.error("Quo webhook signature verification failed (%s scheme)", scheme)
        return Response(
            content=json.dumps({"error": "Invalid signature"}),
            media_type="application/json",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Verified -- only now is it safe to parse.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        logger.error("Verified request had an unparseable body")
        return Response(
            content=json.dumps({"error": "Invalid JSON"}),
            media_type="application/json",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # IDEMPOTENCY KEY.
    #
    # `event["id"]` identifies the EVENT, not the delivery -- every endpoint
    # subscribed to it receives the SAME id. The `webhook-id` HEADER is unique
    # per delivery and stable across retries, which is what an idempotency key
    # needs to be. Legacy deliveries have no such header, so fall back to the
    # envelope id.
    #
    # Retain processed keys for at least 28 hours: Quo retries for ~27h35m.
    idempotency_key = headers.get("webhook-id") or event.get("id")

    logger.info(
        "Verified Quo %s webhook: %s (delivery %s)",
        scheme,
        event.get("type"),
        idempotency_key,
    )

    # Acknowledge within Quo's 10-second budget, then work in the background.
    background_tasks.add_task(handle_event, event, idempotency_key)
    return {"received": True}


def handle_event(event: Mapping[str, Any], idempotency_key: Optional[str]) -> None:
    # TODO: check idempotency_key against your store and return early if seen.
    #   if store.has(idempotency_key): return

    normalized = normalize_event(event)
    event_type = normalized["type"]
    resource = normalized["resource"]
    context = normalized["context"]

    # ORDERING IS NOT GUARANTEED -- not across event families and, per Quo,
    # occasionally not even within a single resource. A
    # call.transcript.completed can arrive before the matching
    # call.summary.completed. Don't drive a state machine off arrival order;
    # compare resource["updatedAt"] against stored state and drop stale events.

    # --- Message events ----------------------------------------------------
    if event_type == "message.received":
        # Legacy: resource["body"] / resource["from"]. Current: resource["text"]
        # + context["senderIdentifier"].
        sender = resource.get("from") or context.get("senderIdentifier")
        text = resource.get("body") or resource.get("text") or ""
        logger.info("Message received from %s: %s", sender, text)
    elif event_type == "message.delivered":
        logger.info("Message %s delivered", resource.get("id"))
    elif event_type == "message.failed":
        logger.info("Message %s failed to send", resource.get("id"))
    elif event_type == "message.undelivered":
        logger.info("Message %s was not delivered by the carrier", resource.get("id"))

    # --- Call events -------------------------------------------------------
    elif event_type == "call.ringing":
        logger.info("Call ringing: %s", resource.get("id"))
    elif event_type == "call.menu.selected":
        logger.info("IVR menu option selected on call %s", resource.get("id"))
    elif event_type == "call.answered":
        logger.info("Call answered: %s", resource.get("id"))
    elif event_type == "call.completed":
        logger.info("Call completed: %s", resource.get("id"))
    elif event_type == "call.forwarded":
        logger.info("Call forwarded: %s", resource.get("id"))
    elif event_type == "call.missed":
        logger.info("Call missed: %s", resource.get("id"))

    # --- Call AI / media events --------------------------------------------
    elif event_type == "call.recording.completed":
        logger.info("Recording ready for call %s", resource.get("id"))
    elif event_type == "call.summary.completed":
        logger.info("AI summary ready for call %s", resource.get("id"))
    elif event_type == "call.transcript.completed":
        logger.info("Transcript ready for call %s", resource.get("id"))
    elif event_type == "call.voicemail.completed":
        logger.info("Voicemail ready for call %s", resource.get("id"))

    # --- Contact events (always workspace-wide) ----------------------------
    elif event_type == "contact.updated":
        logger.info("Contact updated: %s", resource.get("id"))
    elif event_type == "contact.deleted":
        logger.info("Contact deleted: %s", resource.get("id"))

    # --- Task events -------------------------------------------------------
    elif event_type in TASK_EVENTS:
        logger.info("Task event %s: %s", event_type, resource.get("id"))

    else:
        # `integration.created` / `.updated` / `.deleted` are accepted by the
        # create-webhook events enum but have NO documented payload, so they
        # land here. Log and move on rather than guessing their shape.
        logger.info(
            "Unhandled Quo event type: %s%s",
            event_type,
            " (legacy)" if normalized["is_legacy"] else "",
        )

    # `context["contacts"]["lookupStatus"]` is matched | none | unavailable, and
    # `context["participants"]["resolution"]` is available | unavailable. In
    # BOTH cases `unavailable` means UNKNOWN, not empty -- Quo could not perform
    # the lookup. Only `none` means "we looked and there is genuinely nothing".
    contacts = context.get("contacts") or {}
    if contacts.get("lookupStatus") == "unavailable":
        logger.info("  (contact lookup unavailable -- ids are unknown, not empty)")


TASK_EVENTS = frozenset(
    {
        "task.created",
        "task.updated",
        "task.deleted",
        "task.completed",
        "task.reopened",
        "task.assigned",
        "task.unassigned",
        "task.overdue",
        "task.linked",
        "task.unlinked",
        "task.duedate.updated",
        "task.duedate.removed",
        # Legacy webhooks name the due-date events differently -- underscored,
        # and split as "due_date". Keep both or you silently lose due-date
        # changes on legacy subscriptions.
        "task.due_date_changed",  # legacy alias of task.duedate.updated
        "task.due_date_removed",  # legacy alias of task.duedate.removed
    }
)


if __name__ == "__main__":
    import uvicorn

    if not os.environ.get("QUO_WEBHOOK_KEY") and not os.environ.get(
        "QUO_LEGACY_SIGNING_SECRET"
    ):
        logger.warning(
            "Neither QUO_WEBHOOK_KEY nor QUO_LEGACY_SIGNING_SECRET is set -- "
            "every delivery will be rejected"
        )
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
