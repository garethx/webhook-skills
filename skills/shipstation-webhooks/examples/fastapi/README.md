# ShipStation Webhooks - FastAPI Example

Minimal example of receiving ShipStation V1 webhooks with FastAPI.

ShipStation V1 sends **thin payloads** (`resource_url` + `resource_type`) and has **no signature**.
This example (1) validates an unguessable secret token from the `?token=` query string (timing-safe)
and (2) fetches `resource_url` with HTTP Basic auth to get the real data.

## Prerequisites

- Python 3.10+ (uses `str | None` type hints)
- A ShipStation account with API key/secret (Settings → Account → API Settings)

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

4. Set `SHIPSTATION_WEBHOOK_SECRET` (a random token, e.g. `openssl rand -hex 32`) and your
   `SHIPSTATION_API_KEY` / `SHIPSTATION_API_SECRET` in `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Subscribe

Register your endpoint (including the secret token) with ShipStation:

```bash
curl -X POST https://ssapi.shipstation.com/webhooks/subscribe \
  -u "$SHIPSTATION_API_KEY:$SHIPSTATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"target_url":"https://your-app.com/webhooks/shipstation?token=YOUR_SECRET","event":"SHIP_NOTIFY"}'
```

## Test

### Using the Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 shipstation --path /webhooks/shipstation
```

Use the generated HTTPS URL (append `?token=YOUR_SECRET`) as the `target_url` when subscribing.

### Run the tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/shipstation?token=...` - Validates the token, fetches `resource_url`, dispatches on
  `resource_type` (`ORDER_NOTIFY`, `ITEM_ORDER_NOTIFY`, `SHIP_NOTIFY`, `ITEM_SHIP_NOTIFY`,
  `FULFILLMENT_SHIPPED`, `FULFILLMENT_REJECTED`)
- `GET /health` - Health check
