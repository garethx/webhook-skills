# Picqer Webhooks - FastAPI Example

Minimal example of receiving Picqer webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Picqer API key and a hook created with a `secret`

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

3. Add your Picqer hook `secret` to `.env` as `PICQER_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook route is served at http://localhost:8000/webhooks/picqer

## Test

### Run the test suite

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 picqer --path /webhooks/picqer
```

Use the public URL the CLI prints as the hook `address` when you create the hook
(see [references/setup.md](../../references/setup.md) for the `POST /hooks` call).

## Endpoint

- `POST /webhooks/picqer` - Receives and verifies Picqer webhook events
- `GET /health` - Health check
