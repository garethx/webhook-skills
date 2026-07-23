# Persona Webhooks - FastAPI Example

Minimal example of receiving Persona webhooks with signature verification using
FastAPI. Persona has no official server-side SDK, so signatures are verified
manually with Python's `hmac` module.

## Prerequisites

- Python 3.10+ (uses `str | None` type syntax)
- Persona account with a webhook and its signing secret (`wbhsec_...`)

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

4. Add your Persona webhook signing secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real Persona signatures):

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 persona --path /webhooks/persona
```

Then trigger events from the Persona Dashboard (create a test inquiry, or use
**Dashboard → Webhooks → Recent events → Resend** to redeliver a past event).

## Endpoint

- `POST /webhooks/persona` - Receives and verifies Persona webhook events
