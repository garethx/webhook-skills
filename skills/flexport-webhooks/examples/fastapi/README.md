# Flexport Webhooks - FastAPI Example

Minimal example of receiving Flexport webhooks with signature verification using
FastAPI.

## Prerequisites

- Python 3.9+
- Flexport account with a webhook endpoint and secret token (see Settings)

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

4. Add your Flexport endpoint secret token to `.env` as `FLEXPORT_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account needed)
npx hookdeck-cli listen 8000 flexport --path /webhooks/flexport
```

## Endpoint

- `POST /webhooks/flexport` - Receives and verifies Flexport Event objects
