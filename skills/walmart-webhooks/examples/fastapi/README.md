# Walmart Webhooks - FastAPI Example

Minimal example of receiving Walmart Marketplace performance webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- A Walmart Marketplace webhook secret (from the Performance webhook endpoint setup)

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

4. Add your `WALMART_WEBHOOK_SECRET` to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 walmart --path /webhooks/walmart
```

Register the Hookdeck URL as your Walmart performance webhook endpoint.

## How verification works

The handler reads the **raw** request body with `await request.body()`, rebuilds Walmart's canonical string:

```
<METHOD>\n<PATH_AND_QUERY>\n<WM_SEC.TIMESTAMP>\n<SHA256_HEX_OF_RAW_BODY>
```

then compares `base64(HMAC_SHA256(secret, string_to_sign))` with `hmac.compare_digest` against `WM_SEC.SIGNATURE`, rejects stale timestamps, and only parses JSON after verification.

## Endpoint

- `POST /webhooks/walmart` - Receives and verifies Walmart webhook events
- `GET /health` - Health check
