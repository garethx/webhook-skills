# Zendesk Webhooks - FastAPI Example

Minimal example of receiving Zendesk webhooks with HMAC-SHA256 signature
verification in FastAPI.

## Prerequisites

- Python 3.9+
- A Zendesk webhook with a signing secret (or use the static test secret)

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

3. Add your Zendesk signing secret to `.env` as `ZENDESK_WEBHOOK_SECRET`.
   Get it from `GET /api/v2/webhooks/{webhook_id}/signing_secret` or Admin Center →
   the webhook → **Reveal secret**. For test deliveries from the webhook builder,
   use the static secret `dGhpc19zZWNyZXRfaXNfZm9yX3Rlc3Rpbmdfb25seQ==`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real Zendesk signatures):

```bash
pytest test_webhook.py -v
```

### Receive live webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 zendesk --path /webhooks/zendesk
```

No account required — the CLI creates a guest account and gives you a public URL
to set as the **Endpoint URL** on your Zendesk webhook.

## Endpoint

- `POST /webhooks/zendesk` — Receives and verifies Zendesk webhook events
- `GET /health` — Health check

## Key Detail

The handler reads the **raw request body** via `await request.body()` before
parsing. Zendesk signs `timestamp + raw_body`, so the raw bytes must be hashed
exactly as received — parsing/re-serializing first would break verification.
