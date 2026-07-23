# Fireflies Webhooks - FastAPI Example

Minimal example of receiving Fireflies.ai webhooks with signature verification
using FastAPI.

## Prerequisites

- Python 3.9+
- Fireflies account with a webhook signing secret (Settings > Developer Settings)

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

4. Add your Fireflies webhook signing secret to `.env`

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
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 8000 fireflies --path /webhooks/fireflies
```

Then set the URL the CLI prints as your **Webhook URL** in Fireflies Developer
Settings.

## Endpoint

- `POST /webhooks/fireflies` - Receives and verifies Fireflies webhook events
