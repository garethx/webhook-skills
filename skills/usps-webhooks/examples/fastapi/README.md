# USPS Webhooks - FastAPI Example

Minimal example of receiving USPS tracking webhooks (Subscriptions - Tracking
API v3.2) with `X-HMAC` signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- A USPS tracking subscription created with a 32-char `secret`

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

4. Add your USPS subscription secret to `.env` as `USPS_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real `X-HMAC` signatures):

```bash
pytest test_webhook.py
```

### Receive live webhooks with the Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 usps --path /webhooks/usps
```

Use the printed HTTPS URL as the `listenerURL` when you create your USPS
subscription (`POST /subscriptions`).

## Endpoint

- `POST /webhooks/usps` - Receives and verifies USPS tracking notifications
