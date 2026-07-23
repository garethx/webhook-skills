# ShipBob Webhooks - FastAPI Example

Minimal example of receiving ShipBob webhooks in FastAPI with manual signature
verification. ShipBob uses the [Standard Webhooks](https://www.standardwebhooks.com/)
scheme and has no official Python SDK, so this example verifies the HMAC-SHA256
signature manually.

## Prerequisites

- Python 3.9+
- ShipBob account with a webhook subscription and its signing secret (`whsec_...`)

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

3. Add your ShipBob webhook signing secret to `.env` as `SHIPBOB_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

## Webhook Endpoint

```
POST http://localhost:8000/webhooks/shipbob
```

The handler reads the raw body with `await request.body()` before verifying — never
parse the JSON first. The event topic comes from the `x-webhook-topic` header.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 shipbob --path /webhooks/shipbob
```

Register the URL it prints as your subscription URL in ShipBob.

## Manual Testing

Send a sample payload from the ShipBob Dashboard using the **Send example** button
on your webhook subscription.
