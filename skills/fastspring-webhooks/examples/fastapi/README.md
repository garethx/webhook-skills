# FastSpring Webhooks - FastAPI Example

Minimal example of receiving FastSpring webhooks with signature verification.

## Prerequisites

- Python 3.9+
- FastSpring account with a webhook configured and an HMAC SHA256 Secret set

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

3. Add your FastSpring HMAC SHA256 Secret to `.env` as `FASTSPRING_WEBHOOK_SECRET`.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real `X-FS-Signature` values):

```bash
pytest test_webhook.py -v
```

### Receive webhooks locally with Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 fastspring --path /webhooks/fastspring
```

Use the tunnel URL as your webhook endpoint in the FastSpring dashboard
(**Developer Tools → Webhooks → Configuration**).

## Endpoint

- `POST /webhooks/fastspring` - Verifies the `X-FS-Signature` header, then iterates
  the batched `events` array and dispatches on each `event["type"]`.
- `GET /health` - Health check.

## How Verification Works

FastSpring signs the exact raw request body with HMAC-SHA256 keyed on your HMAC
SHA256 Secret, base64-encodes it, and sends it in `X-FS-Signature`. The handler
reads the raw body with `await request.body()` before parsing — verify **once**
against the whole body, then parse and iterate `events`.
