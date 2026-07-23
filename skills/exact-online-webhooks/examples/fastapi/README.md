# Exact Online Webhooks - FastAPI Example

Minimal example of receiving Exact Online webhooks in FastAPI with `HashCode`
signature verification.

## Prerequisites

- Python 3.9+
- An Exact Online OAuth app with a **Webhook secret** (from the App Center)

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

3. Add your Exact App Center **Webhook secret** to `.env` as `EXACT_WEBHOOK_SECRET`.
   (This is the Webhook secret, not the OAuth client secret.)

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST http://localhost:8000/webhooks/exact-online`.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate real `HashCode` signatures using the same algorithm as Exact.

## Receive real webhooks locally

Start a tunnel (no account required) and point it at your local handler:

```bash
npx hookdeck-cli listen 8000 exact-online --path /webhooks/exact-online
```

Register the printed public URL as the `CallbackURL` when you create a
subscription via `POST /api/v1/{division}/webhooks/WebhookSubscriptions`.

## How It Works

- Exact POSTs `{"Content":{…},"HashCode":"<hex>"}`.
- The handler reads the **raw body** with `await request.body()`, computes
  HMAC-SHA256 over the raw `Content` JSON keyed with `EXACT_WEBHOOK_SECRET`,
  hex-encodes and uppercases it, and compares to `HashCode` (401 on mismatch).
- The payload is thin, so fetch the full record from the REST API using
  `Content["Key"]` + `Content["Division"]`, then return **200** quickly.

See [../../references/verification.md](../../references/verification.md) for details.
