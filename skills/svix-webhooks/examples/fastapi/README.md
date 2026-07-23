# Svix Webhooks - FastAPI Example

FastAPI example for receiving Svix webhooks using the official
[`svix`](https://pypi.org/project/svix/) Python SDK.

## Prerequisites

- Python 3.9+
- A signing secret (`whsec_...`) from a sender that delivers via Svix

## Setup

1. Create a virtual environment:
   ```bash
   python3 -m venv venv
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

4. Add your Svix signing secret to `.env` (`SVIX_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

## Webhook Endpoint

```
POST http://localhost:8000/webhooks/svix
```

## API Documentation

FastAPI provides automatic API docs:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 svix --path /webhooks/svix
```

Use the printed URL as the endpoint URL in your sender's Svix App Portal.
