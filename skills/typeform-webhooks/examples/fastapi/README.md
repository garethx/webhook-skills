# Typeform Webhooks - FastAPI Example

Minimal example of receiving Typeform webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- A Typeform form with a webhook secret configured

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

4. Add your Typeform webhook secret to `.env` as `TYPEFORM_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Run the unit tests

```bash
pytest test_webhook.py -v
```

### Receive live webhooks locally

Typeform requires an HTTPS endpoint. The Hookdeck CLI provides a tunnel (no account required):

```bash
npx hookdeck-cli listen 8000 typeform --path /webhooks/typeform
```

Point your webhook `url` (in the Typeform UI or Webhooks API) at the HTTPS URL the CLI prints, then submit a test response to your form.

## Endpoint

- `POST /webhooks/typeform` - Receives and verifies Typeform webhook events
