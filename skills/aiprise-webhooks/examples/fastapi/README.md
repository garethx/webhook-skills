# AiPrise Webhooks - FastAPI Example

Minimal example of receiving AiPrise callbacks (webhooks) with `X-HMAC-SIGNATURE`
verification using FastAPI.

## Prerequisites

- Python 3.9+
- An AiPrise account and your API private key (also the callback signing key)

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

4. Add your AiPrise API private key to `.env` as `AIPRISE_API_KEY`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward callbacks to localhost (no account required)
npx hookdeck-cli listen 8000 aiprise --path /webhooks/aiprise
```

Set the Hookdeck-provided URL as your AiPrise template's callback URL (or per-request
`callback_url`), then run a test verification.

## Endpoint

- `POST /webhooks/aiprise` - Receives and verifies AiPrise callbacks
