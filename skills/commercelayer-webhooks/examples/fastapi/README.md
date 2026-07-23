# Commerce Layer Webhooks - FastAPI Example

Minimal example of receiving Commerce Layer webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Commerce Layer webhook with its `shared_secret` (returned when you create the webhook
  via `POST /api/webhooks` — see [../../references/setup.md](../../references/setup.md))

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

3. Add your webhook `shared_secret` to `.env` as `COMMERCELAYER_SHARED_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the tests (they generate real signatures):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 commercelayer --path /webhooks/commercelayer
```

No account required — the CLI creates a guest account and a public tunnel. Set the URL it
prints as your webhook's `callback_url`, then trigger an event (e.g. place a test order).

## Endpoint

- `POST /webhooks/commercelayer` — Receives and verifies Commerce Layer webhook events
- `GET /health` — Health check

## How verification works

Commerce Layer sends `X-CommerceLayer-Signature` = base64 HMAC-SHA256 of the **raw** body,
keyed with the webhook's `shared_secret`. The handler reads `await request.body()` to get
the raw bytes and verifies them before parsing. Commerce Layer has no Python SDK verify
helper, so verification is done manually. See
[../../references/verification.md](../../references/verification.md).
