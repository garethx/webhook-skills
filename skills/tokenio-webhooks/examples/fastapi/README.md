# Token.io Webhooks - FastAPI Example

Minimal example of receiving Token.io webhooks with Ed25519 signature
verification in FastAPI.

## Prerequisites

- Python 3.9+
- A Token.io member with an Ed25519 public key (Dashboard → Settings → Member Information)

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

3. Add your member's Ed25519 **public key** (base64url) to `.env` as
   `TOKEN_WEBHOOK_PUBLIC_KEY`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/tokenio`.

## How It Works

- `await request.body()` reads the raw bytes so the exact payload Token.io signed
  is preserved for verification.
- `verify_token_webhook` loads your base64url public key as an Ed25519 key and
  verifies the `token-signature` header against the raw body (via the
  `cryptography` package — there is no pip SDK).
- The event type comes from the `token-event` header — the handler dispatches on it.
- Invalid or missing signatures return `400`; valid deliveries return `200`.

## Test

```bash
pytest test_webhook.py
```

The tests generate a real Ed25519 key pair, sign payloads exactly as Token.io
does (Ed25519 over the raw body, base64url), and assert the handler verifies them.

## Local Development

Receive live Token.io deliveries on your machine with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 tokenio --path /webhooks/tokenio
```

Register the printed public URL as the `url` in your `PUT /webhook/config` request.
