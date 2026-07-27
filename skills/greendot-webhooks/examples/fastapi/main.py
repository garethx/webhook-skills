# Generated with: greendot-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

import jwt  # PyJWT
from fastapi import FastAPI, Request, Response

app = FastAPI()

TOKEN_SECRET = os.environ.get("GREENDOT_WEBHOOK_TOKEN_SECRET", "")
REQUIRED_SCOPE = os.environ.get("GREENDOT_WEBHOOK_SCOPE", "post:webhook")
SIGNING_KEY = os.environ.get("GREENDOT_SIGNING_KEY")  # optional, program-gated


def verify_token(auth_header: str) -> dict:
    """1) Authenticate the delivery via the OAuth client_credentials Bearer token.

    Green Dot authenticates itself to your endpoint (push auth). The token is
    issued by the client_credentials grant with scope ``post:webhook``.

    In production, validate against your authorization server (JWKS / RS256 or
    token introspection). Here we validate an HS256 token with a shared secret so
    the example is self-contained and testable.
    """
    token = (auth_header or "").removeprefix("Bearer ").strip()
    if not token:
        raise ValueError("Missing bearer token")
    claims = jwt.decode(token, TOKEN_SECRET, algorithms=["HS256"])
    raw_scope = str(claims.get("scope") or claims.get("scp") or "")
    scopes = raw_scope.replace(",", " ").split()
    if REQUIRED_SCOPE not in scopes:
        raise ValueError("Token missing required scope")
    return claims


def verify_signature(raw_body: bytes, signature_header: str | None) -> bool:
    """2) Optional program-gated payload signature.

    If ``GREENDOT_SIGNING_KEY`` is not configured we rely on the Bearer token
    alone. When configured, verify ``x-gd-signature`` over the RAW body with a
    timing-safe comparison.

    NOTE: The exact algorithm/encoding are not documented publicly — this assumes
    HMAC-SHA256 hex. Confirm with your Green Dot representative.
    """
    if not SIGNING_KEY:
        return True  # not configured -> skip
    if not signature_header:
        return False  # configured but missing -> reject
    expected = hmac.new(SIGNING_KEY.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def handle_event(event: dict) -> None:
    """Dispatch on the ``eventType`` field of the JSON body."""
    event_type = event.get("eventType")
    event_id = event.get("eventId")

    if event_type == "transaction":
        print(f"Transaction event: {event_id}")
        # TODO: sync ledger, notify the customer, etc.
    elif event_type == "accountUpdated":
        print(f"Account updated: {event_id}")
        # TODO: refresh local account record.
    elif event_type == "achTransfer":
        print(f"ACH transfer event: {event_id}")
        # TODO: update funding / payout status.
    elif event_type == "cardUpdate":
        print(f"Card update: {event_id}")
        # TODO: card lifecycle handling.
    elif event_type == "billPayTransfer":
        print(f"Bill pay transfer: {event_id}")
        # TODO: bill pay status / receipts.
    elif event_type == "directDepositSwitch":
        print(f"Direct deposit switch: {event_id}")
        # TODO: DD onboarding funnel.
    elif event_type == "provisioning":
        print(f"Provisioning event: {event_id}")
        # TODO: onboarding orchestration.
    else:
        print(f"Unhandled eventType: {event_type}")


def acknowledge(request_id: str | None, code: int = 0) -> Response:
    """Build the acknowledgement Green Dot expects: a ``responseDetails`` body
    plus the echoed ``x-GD-RequestId`` header. Omitting either causes retries."""
    body = {
        "responseDetails": [
            {"code": code, "subCode": 0, "description": request_id or ""}
        ]
    }
    headers = {"x-GD-RequestId": request_id} if request_id else {}
    return Response(content=json.dumps(body), media_type="application/json", headers=headers)


@app.post("/webhooks/greendot")
async def greendot_webhook(request: Request) -> Response:
    request_id = request.headers.get("x-GD-RequestId")
    raw_body = await request.body()  # raw bytes — required for signature check

    # 1) Authenticate the OAuth Bearer token.
    try:
        verify_token(request.headers.get("authorization"))
    except Exception as err:  # jwt errors + ValueError
        return Response(
            content=json.dumps({"error": "Unauthorized", "message": str(err)}),
            media_type="application/json",
            status_code=401,
        )

    # 2) Optional payload signature.
    if not verify_signature(raw_body, request.headers.get("x-gd-signature")):
        return Response(
            content=json.dumps({"error": "Invalid signature"}),
            media_type="application/json",
            status_code=400,
        )

    # 3) Parse only AFTER authentication succeeds.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(
            content=json.dumps({"error": "Invalid JSON"}),
            media_type="application/json",
            status_code=400,
        )

    # 4) Handle the event.
    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Handler error: {err}")
        return Response(
            content=json.dumps({"error": "Handler error"}),
            media_type="application/json",
            status_code=500,
        )

    # 5) Acknowledge: echo x-GD-RequestId + return responseDetails.
    return acknowledge(request_id)
