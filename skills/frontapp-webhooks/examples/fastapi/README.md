# Front Webhooks - FastAPI Example

Minimal example of receiving Front application webhooks with signature verification and the
`X-Front-Challenge` subscription handshake.

## Prerequisites

- Python 3.9+
- A Front app with a webhook signing key

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

3. Add your Front app signing key to `.env` as `FRONT_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real Front signatures):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Front webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 8000 frontapp --path /webhooks/frontapp
```

Use the printed HTTPS URL as the endpoint in your Front app's webhook configuration. Front
will send an `X-Front-Challenge` validation request first — this handler echoes it
automatically.

## Endpoint

- `POST /webhooks/frontapp` - Receives, validates the challenge, and verifies Front webhooks
- `GET /health` - Health check
