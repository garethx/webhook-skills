# Treezor Webhooks - FastAPI Example

Minimal example of receiving Treezor webhooks with signature verification using FastAPI.

Treezor's signature is a **field in the JSON body** (`object_payload_signature`), not
an HTTP header, and it covers the canonicalized `object_payload` — see
[../../references/verification.md](../../references/verification.md).

## Prerequisites

- Python 3.9+
- A Treezor `webhook_secret` (from your Treezor Account Manager)

## Setup

1. Create virtual environment:
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

4. Add your Treezor webhook secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Run the test suite

```bash
pytest test_webhook.py -v
```

### Receive webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 treezor --path /webhooks/treezor
```

This prints a public URL. Register it as your subscription's `url` via
`POST /settings/hooks` on `https://webhook.sandbox.treezor.co` (see
[../../references/setup.md](../../references/setup.md)).

## Endpoint

- `POST /webhooks/treezor` - Receives and verifies Treezor webhook events
