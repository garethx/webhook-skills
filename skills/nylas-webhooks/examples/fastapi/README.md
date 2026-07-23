# Nylas Webhooks - FastAPI Example

Minimal example of receiving Nylas webhooks with FastAPI, including `x-nylas-signature`
verification, the challenge handshake, and gzip handling.

## Prerequisites

- Python 3.10+
- A Nylas application with a webhook destination (see [../../references/setup.md](../../references/setup.md))
- The destination's `webhook_secret`

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

3. Add your Nylas `webhook_secret` to `.env` as `NYLAS_WEBHOOK_SECRET` (or export it).

## Run

```bash
export NYLAS_WEBHOOK_SECRET=your_webhook_secret
uvicorn main:app --reload --port 8000
```

- `GET  /webhooks/nylas` — challenge handshake (echoes `?challenge=`)
- `POST /webhooks/nylas` — receives and verifies notifications

Server runs on http://localhost:8000

## Test

### Run the unit tests

```bash
pytest test_webhook.py -v
```

The tests generate valid `x-nylas-signature` values (hex HMAC-SHA256 of the raw body),
including a gzip case, so no live traffic is needed.

### Receive live webhooks locally

```bash
npx hookdeck-cli listen 8000 nylas --path /webhooks/nylas
```

Point your Nylas webhook URL at the Hookdeck URL it prints, then trigger events.

## How Verification Works

The handler reads the raw request bytes with `await request.body()` and verifies the
`x-nylas-signature` (hex HMAC-SHA256 of the raw body) **before** parsing. When
`Content-Encoding: gzip` is set, it verifies the **compressed** bytes and decompresses
only after the check passes. The Nylas Python SDK has no signature-verify helper, so this
uses a manual HMAC check with `hmac.compare_digest`. See
[../../references/verification.md](../../references/verification.md) for details.
