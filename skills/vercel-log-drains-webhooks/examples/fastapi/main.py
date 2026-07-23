# Generated with: vercel-log-drains-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import hmac
import hashlib
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

drain_secret = os.environ.get("VERCEL_LOG_DRAIN_SECRET", "")
verify_token = os.environ.get("VERCEL_VERIFY", "")


def verify_vercel_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Vercel Log Drain signature.

    Vercel signs the RAW request body with HMAC-SHA1 keyed on the drain's
    signature secret and sends the hex digest in `x-vercel-signature`
    (no `sha1=` prefix).
    """
    if not signature_header:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha1,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature_header, expected_signature)


def parse_logs(raw_body: bytes) -> list:
    """Parse a batch of log entries.

    Vercel delivers either a JSON array (`[{...},{...}]`) or NDJSON
    (one JSON object per line), depending on the drain's configured encoding.
    """
    text = raw_body.decode("utf-8").strip()
    if not text:
        return []
    if text.startswith("["):
        return json.loads(text)  # JSON array encoding
    return [json.loads(line) for line in text.splitlines() if line.strip()]  # NDJSON


def handle_log_entry(log: dict) -> None:
    """Dispatch a single log entry based on its `source`.

    Log drains have no named event types — `source` is the dispatch dimension.
    """
    source = log.get("source")

    if source == "lambda":
        print(f"[lambda] {log.get('level')} {log.get('statusCode', '')} "
              f"{log.get('path', '')}: {log.get('message', '')}")
        # TODO: forward function logs / errors to your observability stack
    elif source == "edge":
        print(f"[edge] {log.get('level')} {log.get('path', '')}: {log.get('message', '')}")
    elif source == "build":
        print(f"[build] {log.get('level')} ({log.get('buildId', 'n/a')}): {log.get('message', '')}")
    elif source == "static":
        print(f"[static] {log.get('statusCode', '')} {log.get('path', '')}")
    elif source == "external":
        print(f"[external] {log.get('destination', '')} {log.get('path', '')}")
    elif source == "firewall":
        proxy = log.get("proxy") or {}
        print(f"[firewall] {proxy.get('wafAction', 'denied')} "
              f"{proxy.get('clientIp', '')} {log.get('path', '')}")
    elif source == "redirect":
        print(f"[redirect] {log.get('path', '')} -> {log.get('destination', '')}")
    else:
        print(f"[{source or 'unknown'}] {log.get('message', '')}")

    # A statusCode of -1 means the lambda crashed with no response
    if log.get("statusCode") == -1:
        print(f"Lambda crashed (no response): request {log.get('requestId', 'unknown')}")


@app.post("/webhooks/vercel-log-drains")
async def vercel_log_drain(request: Request):
    # Echo the verification token so the create/test handshake succeeds.
    verify_headers = {"x-vercel-verify": verify_token} if verify_token else {}

    raw_body = await request.body()
    signature_header = request.headers.get("x-vercel-signature")

    # The create/test probe is unsigned. Treat a missing signature as the
    # handshake: acknowledge with 200 and do not process logs.
    if not signature_header:
        return JSONResponse(
            content={"received": True, "handshake": True},
            headers=verify_headers,
        )

    # Verify signed deliveries against the raw body.
    if not verify_vercel_signature(raw_body, signature_header, drain_secret):
        print("Vercel log drain signature verification failed")
        return JSONResponse(
            status_code=403,
            content={"code": "invalid_signature", "error": "signature didn't match"},
            headers=verify_headers,
        )

    # Parse the batch only after verification succeeds.
    try:
        logs = parse_logs(raw_body)
    except (ValueError, json.JSONDecodeError):
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid log payload"},
            headers=verify_headers,
        )

    print(f"Received {len(logs)} log entr{'y' if len(logs) == 1 else 'ies'}")
    for log in logs:
        handle_log_entry(log)

    return JSONResponse(
        content={"received": True, "count": len(logs)},
        headers=verify_headers,
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
