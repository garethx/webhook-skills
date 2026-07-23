# Statsig Webhooks - FastAPI Example

Minimal example of receiving Statsig Event Webhook (Generic Webhook) requests with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- A Statsig project with the **Generic Webhook** integration enabled and a signing secret

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Statsig webhook signing secret to `.env` (Project Settings → **Integrations** → **Generic Webhook** → signing secret on the integration card).

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward Statsig events to your local server (no account needed)
npx hookdeck-cli listen 3000 statsig --path /webhooks/statsig
```

Paste the Hookdeck URL into the **destination URL** field of the Generic Webhook integration in Statsig.

### Run Unit Tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/statsig` — Verifies the `X-Statsig-Signature` header and dispatches config-change (`{ data: [...] }`) and exposure (array) batches.
