# Pylon Webhooks - FastAPI Example

Minimal example of receiving Pylon webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Pylon webhook destination with its signing secret

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

3. Add your Pylon destination signing secret to `.env` as `PYLON_WEBHOOK_SECRET`
   (Pylon shows the secret only once, when you create the destination).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real `hs256=` signatures):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Forward Pylon deliveries to your local server with the Hookdeck CLI (no account
required — it creates a guest account on first run):

```bash
npx hookdeck-cli listen 8000 pylon --path /webhooks/pylon
```

Put the URL Hookdeck prints into your Pylon destination's URL field, then trigger
an event in Pylon (e.g. create or update an issue).

## How It Works

- Reads the **raw body** with `await request.body()` for verification.
- Verifies the `Pylon-Webhook-Signature` header: `hs256=` + hex HMAC-SHA256 over
  `Pylon-Webhook-Timestamp + "." + rawBody`, compared with `hmac.compare_digest`.
- Returns `400` on a missing/invalid signature, `200` once verified.

> Event names (`issue.created`, `issue.updated`, …) are **illustrative**. Confirm
> the real event types and the payload's event-type field against your own Pylon
> destination configuration.

## Endpoints

- `POST /webhooks/pylon` - Receives and verifies Pylon webhook events
- `GET /health` - Health check
