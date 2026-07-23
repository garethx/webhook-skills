# Alchemy Webhooks - FastAPI Example

Minimal example of receiving Alchemy Notify webhooks with `X-Alchemy-Signature` verification using
FastAPI. Alchemy has no signature-verification SDK, so verification is implemented manually with
Python's `hmac`.

## Prerequisites

- Python 3.9+
- An Alchemy webhook configured in the [Notify dashboard](https://dashboard.alchemy.com/) with its
  per-webhook signing key

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

4. Add your Alchemy webhook signing key to `.env` as `ALCHEMY_SIGNING_KEY` (copy it from the top-right
   of the webhook's detail page in the Notify dashboard).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Run the tests

```bash
pytest test_webhook.py
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no install, no account required)
npx hookdeck-cli listen 8000 alchemy --path /webhooks/alchemy
```

Then set the resulting Hookdeck URL as the webhook target in the Alchemy Notify dashboard.

## Endpoint

- `POST /webhooks/alchemy` - Receives and verifies Alchemy webhook events
- `GET /health` - Health check
