# Akeneo Webhooks - FastAPI Example

Minimal example of receiving Akeneo PIM (Events API) webhooks with signature
verification using FastAPI.

## Prerequisites

- Python 3.9+
- An Akeneo PIM connection with event subscription enabled and its **secret**

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

3. Add your Akeneo connection secret to `.env` as `AKENEO_WEBHOOK_SECRET`

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

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Akeneo requests to your local server — no account required:

```bash
npx hookdeck-cli listen 8000 akeneo --path /webhooks/akeneo
```

Set the connection's **Request URL** (Connect → Connection settings → Event
subscription) to the tunnel URL the CLI prints, then save a product in the PIM to
trigger a `product.updated` event.

## Endpoint

- `POST /webhooks/akeneo` - Receives and verifies Akeneo webhook events. All event
  types arrive here; the handler dispatches by `action`.

## How Verification Works

The handler reads the **raw** request body with `await request.body()`, recomputes
the HMAC-SHA256 of `timestamp + "." + rawBody` using the connection secret,
compares it with `hmac.compare_digest` against `x-akeneo-request-signature`, and
rejects stale requests (5-minute window). Payloads are batched as an `events` array.

There is no official Akeneo SDK, so verification is done manually — see
[../../references/verification.md](../../references/verification.md).
