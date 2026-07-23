# Vercel Log Drains - FastAPI Example

Minimal example of receiving Vercel Log Drains deliveries with `x-vercel-signature`
verification (HMAC-SHA1) using FastAPI.

## Prerequisites

- Python 3.9+
- A Vercel team on a Pro or Enterprise plan with a log drain configured
- Your drain's **signature secret** and **verification token**

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your drain signature secret (`VERCEL_LOG_DRAIN_SECRET`) and verification
   token (`VERCEL_VERIFY`) to `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Receive real deliveries locally

Tunnel Vercel deliveries to your local server with the Hookdeck CLI (no account
required):

```bash
npx hookdeck-cli listen 8000 vercel-log-drains --path /webhooks/vercel-log-drains
```

## How It Works

- `await request.body()` returns the **raw bytes** Vercel signed, so the
  HMAC-SHA1 check runs before any JSON parsing.
- The `x-vercel-verify` response header is echoed so the create/test handshake
  succeeds (the probe is unsigned).
- Invalid signatures return `403`; verified batches (JSON array or NDJSON) are
  dispatched by log `source`.

## Endpoint

- `POST /webhooks/vercel-log-drains` - Receives and verifies Vercel log drain deliveries
- `GET /health` - Health check
