import os
import json
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Header
from retell import Retell

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# The Retell API key (with the webhook badge) doubles as the signing secret.
RETELL_API_KEY = os.getenv("RETELL_API_KEY", "")

if not RETELL_API_KEY:
    logger.warning("RETELL_API_KEY not set!")

# The Retell Python SDK exposes client.verify(body, api_key, signature), which
# parses the X-Retell-Signature header, enforces the ~5 minute timestamp window,
# and returns a bool. (The Node SDK has no equivalent — Node verifies manually.)
client = Retell(api_key=RETELL_API_KEY or "placeholder")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


@app.post("/webhooks/retell")
async def retell_webhook(
    request: Request,
    x_retell_signature: str | None = Header(None, alias="X-Retell-Signature"),
):
    """Receive and verify Retell AI webhooks."""
    if not x_retell_signature:
        raise HTTPException(status_code=400, detail="Missing signature header")

    # Verify against the RAW body — never a re-serialized version
    raw_body = await request.body()

    is_valid = client.verify(
        raw_body.decode("utf-8"),
        api_key=RETELL_API_KEY,
        signature=x_retell_signature,
    )
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid signature")

    event_data = json.loads(raw_body)
    event = event_data.get("event")
    call = event_data.get("call") or {}
    chat = event_data.get("chat") or {}
    entity_id = call.get("call_id") or chat.get("chat_id")

    logger.info("Received Retell webhook: %s (%s)", event, entity_id)

    # Dedupe on `event` + call_id/chat_id here — Retell retries up to 3 times.

    if event == "call_started":
        logger.info("Call started: %s", call.get("call_id"))
    elif event == "call_ended":
        logger.info("Call ended: %s", call.get("call_id"))
    elif event == "call_analyzed":
        # Transcript, summary, and sentiment are available on this event
        logger.info("Call analyzed: %s", call.get("call_id"))
    elif event == "transcript_updated":
        logger.info("Transcript updated: %s", call.get("call_id"))
    elif event in ("transfer_started", "transfer_bridged", "transfer_cancelled", "transfer_ended"):
        logger.info("Transfer event %s: %s", event, call.get("call_id"))
    elif event in ("chat_started", "chat_ended", "chat_analyzed"):
        logger.info("Chat event %s: %s", event, chat.get("chat_id"))
    else:
        logger.info("Unhandled event type: %s", event)

    # Acknowledge quickly (within 10s) so Retell doesn't retry
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
