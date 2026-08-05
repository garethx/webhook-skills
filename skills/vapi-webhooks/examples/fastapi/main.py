# Generated with: vapi-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="Vapi Webhook Handler")

# The four message.type values that REQUIRE a JSON response body.
REQUEST_RESPONSE_TYPES = [
    "assistant-request",
    "tool-calls",
    "transfer-destination-request",
    "knowledge-base-request",
]

# Informational message.type values — acknowledge with 200 (no body needed).
INFORMATIONAL_TYPES = [
    "status-update",
    "end-of-call-report",
    "hang",
    "conversation-update",
    "transcript",
    "speech-update",
    "model-output",
    "transfer-update",
    "user-interrupted",
    "language-change-detected",
    "phone-call-control",
    "chat.created",
    "chat.deleted",
    "session.created",
    "session.updated",
    "session.deleted",
]


def extract_token(headers) -> Optional[str]:
    """Read the shared secret from the Authorization (Bearer) or X-Vapi-Secret header."""
    auth = headers.get("authorization")
    if auth:
        return auth[7:] if auth.startswith("Bearer ") else auth
    return headers.get("x-vapi-secret")


def verify_vapi_secret(headers, expected: Optional[str]) -> bool:
    """
    Verify a Vapi webhook using the shared-secret path.

    Vapi has NO fixed signature scheme. The recommended auth is a literal shared
    secret carried in `Authorization: Bearer <token>` or the legacy `X-Vapi-Secret`
    header. Compare it with a timing-safe comparison.
    """
    token = extract_token(headers)
    if not token or not expected:
        return False
    return hmac.compare_digest(token, expected)


@app.post("/webhooks/vapi")
async def handle_vapi_webhook(request: Request):
    """Handle Vapi Server URL messages (informational + request/response types)."""
    expected = os.getenv("VAPI_WEBHOOK_SECRET")

    # Authenticate first (the secret is in a header, not the body).
    if not verify_vapi_secret(request.headers, expected):
        print("Vapi webhook authentication failed: shared secret mismatch")
        raise HTTPException(status_code=401, detail="Unauthorized")

    body: Dict[str, Any] = await request.json()
    # The event type is NESTED at message.type — not a top-level field.
    message: Dict[str, Any] = body.get("message") or {}
    message_type = message.get("type")
    call_id = (message.get("call") or {}).get("id")
    print(f"Received Vapi message {message_type} (call {call_id})")

    # --- Request/response types: MUST return a JSON body ---

    if message_type == "assistant-request":
        # Answer within ~7.5s. Return one of: assistantId / assistant / destination / error.
        return {"assistantId": os.getenv("VAPI_ASSISTANT_ID", "YOUR_ASSISTANT_ID")}

    if message_type == "tool-calls":
        tool_call_list = message.get("toolCallList") or []
        results = [
            {
                "name": (tc.get("function") or {}).get("name") or tc.get("name"),
                "toolCallId": tc.get("id") or tc.get("toolCallId"),
                # TODO: execute the tool and put its return value here.
                "result": "TODO: your tool result",
            }
            for tc in tool_call_list
        ]
        return {"results": results}

    if message_type == "transfer-destination-request":
        return {
            "destination": {
                "type": "number",
                "number": os.getenv("VAPI_TRANSFER_NUMBER", "+15551234567"),
            },
            "message": {"type": "request-start", "message": "Transferring you now."},
        }

    if message_type == "knowledge-base-request":
        # TODO: look up relevant documents for the query.
        return {"documents": []}

    # --- Informational types: acknowledge with 200, no body required ---

    if message_type == "status-update":
        print(f"Call status: {message.get('status')}")
    elif message_type == "end-of-call-report":
        print(f"End of call: {message.get('endedReason')} cost: {message.get('cost')}")
        # TODO: store the report / transcript / recording.
    elif message_type == "transcript":
        print(f"Transcript: {message.get('role')} {message.get('transcript')}")
    elif message_type not in INFORMATIONAL_TYPES:
        print(f"Unhandled Vapi message type: {message_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
