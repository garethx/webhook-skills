# ShipHero Webhooks - FastAPI Example

Minimal example of receiving ShipHero webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- A ShipHero webhook registered via `webhook_create` (gives you the `shared_signature_secret`)

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

4. Add your `shared_signature_secret` to `.env` as `SHIPHERO_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real ShipHero signatures):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 8000 shiphero --path /webhooks/shiphero
```

Register the tunnel URL as the webhook `url` via the `webhook_create` mutation.

## Endpoint

- `POST /webhooks/shiphero` - Receives and verifies ShipHero webhook events

The handler reads the **raw body** with `await request.body()` (required for HMAC
verification), recomputes `base64(HMAC-SHA256(rawBody, secret))`, compares it with
`hmac.compare_digest` against the `x-shiphero-hmac-sha256` header, then dispatches on
the payload's `webhook_type` field.
