# Uber Webhooks - FastAPI Example

Minimal example of receiving Uber Eats webhooks with `X-Uber-Signature`
verification using FastAPI.

## Prerequisites

- Python 3.9+
- Uber app with the Uber Eats API enabled (for the Client Secret)

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

4. Add your Uber app **Client Secret** to `.env` as `UBER_CLIENT_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 uber --path /webhooks/uber
```

Then set the Hookdeck URL as your **Primary Webhook URL** in the Uber Developer
Dashboard (Webhooks tab).

## Endpoint

- `POST /webhooks/uber` - Receives and verifies Uber Eats webhook events
