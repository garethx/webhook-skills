# Bunny Stream Webhooks - FastAPI Example

Minimal example of receiving Bunny Stream webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- A Bunny Stream video library with a webhook URL configured

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

4. Add your library's **Read-Only API key** to `.env` as `BUNNY_STREAM_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 bunny-stream --path /webhooks/bunny-stream
```

Then set the Hookdeck URL as the Webhook URL in your Bunny Stream library settings.

## Endpoint

- `POST /webhooks/bunny-stream` - Receives and verifies Bunny Stream webhook events

## Run tests

```bash
pytest test_webhook.py -v
```
