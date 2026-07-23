# Retell AI Webhooks - FastAPI Example

FastAPI example for receiving Retell AI webhooks with signature verification.

This example uses the official **Retell Python SDK** (`retell-sdk`), which
provides `client.verify(body, api_key, signature)` to validate the
`X-Retell-Signature` header (HMAC-SHA256 over the raw body + timestamp, with a
5-minute replay window).

## Prerequisites

- Python 3.10+
- A Retell API key with the webhook badge (used as the signing secret)

## Setup

1. Create a virtual environment:
   ```bash
   python3 -m venv venv
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

4. Add your Retell API key to `.env` as `RETELL_API_KEY`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

## Endpoints

- `POST /webhooks/retell` - Receives and verifies Retell webhooks
- `GET /health` - Health check endpoint

## Local Testing with Hookdeck

Use Hookdeck CLI to receive webhooks locally:

```bash
npx hookdeck-cli listen 8000 retell --path /webhooks/retell
```

This creates a public URL that forwards to your local server. Paste it into your
Retell dashboard (Webhooks tab) or an agent's `webhook_url`, then place a test
call.
