# Faundit Webhooks - FastAPI Example

Minimal example of receiving Faundit webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.10+
- Faundit webhook signing secret (request from **tech@faundit.com** — not self-service)

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

3. Add your Faundit webhook signing secret to `.env`:
   ```bash
   FAUNDIT_WEBHOOK_SECRET=your_signing_secret
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The webhook route is at `POST /webhooks/faundit`.

## Test

Run the test suite:

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 faundit --path /webhooks/faundit
```

Then give the Hookdeck URL to your Faundit contact so deliveries route to your local
endpoint.

## How It Works

- The route reads the **raw** body with `await request.body()` before parsing.
- Verification uses the current **v1** scheme: HMAC-SHA256 (hex) over
  `v1:<X-Faundit-Timestamp>:<raw body>`, compared against the
  `X-Faundit-Signature-Next` header.
- Invalid or missing signatures return `400`; valid deliveries return `200`.

## Events Handled

- `item-status` — item status changes (`delivered`, `in-route`, `finished`, `expired`, …)
- `request-status` — request status changes (`registered`, `resolved`, `not-found`, …)

## Endpoint

- `POST /webhooks/faundit` - Receives and verifies Faundit webhook events
