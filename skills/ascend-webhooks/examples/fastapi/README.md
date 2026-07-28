# Ascend Webhooks - FastAPI Example

Minimal example of receiving Ascend webhooks with signature verification using
FastAPI and Python's built-in `hmac`/`hashlib` (there is no official Ascend SDK).

## Prerequisites

- Python 3.10+
- An Ascend webhook signing secret (email `developers@useascend.com`)

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

3. Add your Ascend webhook signing secret to `.env`:
   ```bash
   ASCEND_WEBHOOK_SECRET=your_ascend_webhook_secret
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST http://localhost:8000/webhooks/ascend`.

## Test

Run the unit tests (they generate real Ascend signatures):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Ascend deliveries to your local server (no
install, no account required):

```bash
npx hookdeck-cli listen 8000 ascend --path /webhooks/ascend
```

## How It Works

1. `await request.body()` reads the **raw** body — required because the
   signature is computed over the exact bytes Ascend sent.
2. `verify_ascend_signature()` parses `X-Ascend-Signature` (`t=...,v1=...`),
   recomputes `HMAC-SHA256("<timestamp>:<raw_body>", secret)`, and does a
   constant-time compare with `hmac.compare_digest`.
3. On success the body is parsed and dispatched on `event["type"]`; the handler
   returns `200`. On failure it returns `400`.
