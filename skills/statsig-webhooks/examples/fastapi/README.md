# Statsig Webhooks - FastAPI Example

Minimal example of receiving Statsig event webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- Statsig account with a configured Event Webhook and signing secret

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

4. Add your Statsig webhook signing secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account needed)
npx hookdeck-cli listen 3000 statsig --path /webhooks/statsig
```

Then send a test event from the Statsig **Webhook Debug** tool in your project's integration settings.

## Endpoint

- `POST /webhooks/statsig` - Receives and verifies Statsig webhook events
