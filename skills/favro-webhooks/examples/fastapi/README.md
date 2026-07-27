# Favro Webhooks - FastAPI Example

Minimal example of receiving Favro webhooks in FastAPI with `X-Favro-Webhook`
signature verification.

## Prerequisites

- Python 3.9+
- A Favro webhook with a `secret` and a registered `postToUrl`

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

3. Set `FAVRO_WEBHOOK_SECRET` to the secret you chose at webhook creation, and
   `FAVRO_WEBHOOK_URL` to the exact `postToUrl` you registered. The URL is part
   of the signature, so it must match byte-for-byte.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/favro`.

## How Verification Works

Favro does **not** use Standard Webhooks. There is no official Python SDK, so
verification is manual. The signature header is `X-Favro-Webhook` and is computed
over `payloadId + webhookUrl` (not the request body):

```
X-Favro-Webhook = base64( HMAC-SHA1( secret, payloadId + webhookUrl ) )
```

The handler reads the raw body only to extract `payloadId`, recomputes the HMAC
with your registered `FAVRO_WEBHOOK_URL`, and compares with
`hmac.compare_digest`. The setup **ping** is signed the same way — the handler
verifies it and returns `200` to validate the webhook.

## Test

```bash
pytest test_webhook.py -v
```

## Local Development with Hookdeck CLI

Expose your local server so Favro can reach it (no account required):

```bash
npx hookdeck-cli listen 8000 favro --path /webhooks/favro
```

Register the printed public URL as the `postToUrl`, and set `FAVRO_WEBHOOK_URL`
to that same URL.
