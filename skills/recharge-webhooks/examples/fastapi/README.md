# Recharge Webhooks - FastAPI Example

Minimal example of receiving Recharge webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Recharge account with an **API Client Secret** (see below)

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

3. Add your Recharge **API Client Secret** to `.env`. Find it in the merchant portal:
   **Tools and apps → API tokens →** open your token **→ API Client Secret**. This is not
   the API access token used to call the API.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real signatures using Recharge's algorithm):

```bash
pytest test_webhook.py -v
```

### Receive live webhooks locally

```bash
npx hookdeck-cli listen 8000 recharge --path /webhooks/recharge
```

Register the printed tunnel URL as the `address` when you create a webhook subscription
(`POST https://api.rechargeapps.com/webhooks`), then trigger events in Recharge or use the
[Test webhooks](https://developer.rechargepayments.com/2021-11/webhooks_endpoints/webhooks_test) API.

## Verification note

Despite the `X-Recharge-Hmac-Sha256` header name, Recharge uses a **plain SHA-256** of
`client_secret + raw_body` (secret first), hex-encoded — **not HMAC**. The handler reads the raw body
with `await request.body()` before parsing so the exact bytes are hashed.

## Endpoint

- `POST /webhooks/recharge` - Receives and verifies Recharge webhook events
- `GET /health` - Health check
