# Solidgate Webhooks - FastAPI Example

Minimal example of receiving Solidgate webhooks with FastAPI and manual signature
verification (the Solidgate Python SDK has no public webhook-verify helper).

## Prerequisites

- Python 3.9+
- Solidgate webhook keys (`wh_pk_` / `wh_sk_`) from Hub → Developers

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

3. Add your Solidgate webhook public and secret keys to `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is at `POST /webhooks/solidgate`.

## Test

```bash
pytest test_webhook.py -v
```

## Receive Real Webhooks Locally

```bash
npx hookdeck-cli listen 8000 solidgate --path /webhooks/solidgate
```

Register the printed tunnel URL as your endpoint in **Hub → Developers → Channels →
Webhooks**.

## How Verification Works

Solidgate sends `merchant` (your `wh_pk_` public key) and `signature` headers. The
handler reads the **raw** body with `await request.body()` before parsing, then
verifies `base64( hex( HMAC-SHA512(secretKey, publicKey + rawBody + publicKey) ) )`
with `hmac.compare_digest`. See
[../../references/verification.md](../../references/verification.md) for details.
