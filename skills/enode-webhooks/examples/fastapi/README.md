# Enode Webhooks - FastAPI Example

Minimal example of receiving Enode webhooks with HMAC-SHA1 signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- An Enode webhook created via `POST /webhooks` with a secret you generated

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

4. Add your Enode webhook secret to `.env` (the same `secret` you passed when creating the webhook)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 enode --path /webhooks/enode
```

### Run the tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/enode` - Receives and verifies Enode webhook events (a JSON array of events)
