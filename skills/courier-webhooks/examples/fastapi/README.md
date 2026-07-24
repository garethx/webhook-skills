# Courier Webhooks - FastAPI Example

Minimal example of receiving Courier outbound webhooks with signature verification using
FastAPI.

## Prerequisites

- Python 3.10+
- Courier account with a webhook signing secret

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

4. Add your Courier webhook signing secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Courier webhooks to your local server (no account or
install required):

```bash
npx hookdeck-cli listen 8000 courier --path /webhooks/courier
```

Then set the printed URL as your webhook endpoint in the Courier dashboard
(**Settings → General → + Outbound Webhook**) and trigger an event.

## How It Works

- Reads the **raw body** with `await request.body()` before parsing, so the signature can
  be verified against the exact bytes Courier signed.
- Verifies the `courier-signature` header (`t=<epoch_ms>,signature=<hex>`) by recomputing
  HMAC-SHA256 over `<timestamp>.<raw_body>` and comparing with `hmac.compare_digest`.
- Returns `400` for invalid signatures and `200` for valid events.

## Endpoint

- `POST /webhooks/courier` - Receives and verifies Courier webhook events
- `GET /health` - Health check
