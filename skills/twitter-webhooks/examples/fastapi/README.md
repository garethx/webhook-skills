# Twitter / X Webhooks - FastAPI Example

Minimal example of receiving Twitter/X Account Activity API webhooks with CRC
handling and signature verification using FastAPI.

## Prerequisites

- Python 3.10+
- An approved X developer account with Account Activity API access
- Your app's **consumer secret** (API Secret Key)

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

3. Add your consumer secret to `.env` (X Developer Portal → your App → **Keys and
   tokens** → **API Key and Secret**).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward X events to your local server (no account needed)
npx hookdeck-cli listen 8000 twitter --path /webhooks/twitter
```

Register the printed HTTPS URL with the V2 Webhooks API (`POST /2/webhooks`). X
sends a CRC `GET` immediately; the endpoint answers it automatically.

### Run Unit Tests

```bash
pytest test_webhook.py -v
```

## Endpoints

- `GET /webhooks/twitter` — Answers the CRC `crc_token` challenge with a `response_token`.
- `POST /webhooks/twitter` — Verifies the `x-twitter-webhooks-signature` header and dispatches Account Activity events.
