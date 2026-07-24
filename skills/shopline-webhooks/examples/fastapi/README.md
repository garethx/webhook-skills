# SHOPLINE Webhooks - FastAPI Example

Minimal example of receiving SHOPLINE webhooks with signature verification using
FastAPI.

## Prerequisites

- Python 3.9+
- A SHOPLINE app with its **app secret** (Developer Center → App credentials)

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your SHOPLINE app secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Run unit tests

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account needed)
npx hookdeck-cli listen 8000 shopline --path /webhooks/shopline
```

## Endpoint

- `POST /webhooks/shopline` - Receives and verifies SHOPLINE webhook events
