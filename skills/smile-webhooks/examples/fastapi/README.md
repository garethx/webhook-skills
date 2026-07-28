# Smile API Webhooks - FastAPI Example

Minimal example of receiving Smile API (getsmileapi.com) webhooks with
`Smile-Signature` (HMAC-SHA512) verification.

## Prerequisites

- Python 3.10+
- A Smile API account with a registered webhook and its secret

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SMILE_WEBHOOK_SECRET` in your environment to the secret you set when
   registering the webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at
`POST /webhooks/smile`.

## How It Works

1. **Verify** the `Smile-Signature` header — HMAC-SHA512 (hex) over the raw
   request body — with a constant-time comparison (returns `400` otherwise).
2. **Parse** the JSON body and dispatch on the `type` field.
3. **Acknowledge** with `200`. Dedupe on the event `id` — Smile retries up to 2
   times.

Smile has no official SDK, so verification is manual (Python's `hmac` +
`hashlib`). See [../../references/verification.md](../../references/verification.md).

## Test

```bash
pytest test_webhook.py
```

The tests generate real signatures with HMAC-SHA512 — the same algorithm as the
handler.

## Local Development

Tunnel Smile deliveries to your local server with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 8000 smile --path /webhooks/smile
```

No account required — the CLI creates a guest account and provides a local
tunnel plus a web UI for inspecting requests.
