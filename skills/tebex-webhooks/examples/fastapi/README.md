# Tebex Webhooks - FastAPI Example

Minimal example of receiving Tebex webhooks with signature verification using
FastAPI. Tebex has no SDK, so the signature is verified manually.

## Prerequisites

- Python 3.9+
- Tebex store with a webhook secret (Creator Panel → Developers → Webhooks → Endpoints)

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

4. Add your Tebex webhook secret to `.env` (`TEBEX_WEBHOOK_SECRET`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

Use the Hookdeck CLI to tunnel Tebex webhooks to your local server:

```bash
npx hookdeck-cli listen 8000 tebex --path /webhooks/tebex
```

Point your Tebex endpoint at the URL the CLI prints. Editing and saving the
endpoint re-sends a `validation.webhook` — this handler echoes the `id` back
with a 200 to activate it.

## How verification works

The handler reads the raw body with `await request.body()` **before** parsing,
then verifies the hex `X-Signature` header. Tebex signs in two steps: SHA-256
the raw body, then HMAC-SHA256 that hash with your webhook secret.

## Endpoint

- `POST /webhooks/tebex` - Receives and verifies Tebex webhook events
