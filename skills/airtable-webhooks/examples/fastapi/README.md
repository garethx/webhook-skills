# Airtable Webhooks - FastAPI Example

Minimal example of receiving Airtable webhook notifications with FastAPI, verifying the
signature, and fetching base changes from the payloads API.

## Prerequisites

- Python 3.10+
- An Airtable webhook created via the API (see [../../references/setup.md](../../references/setup.md))
- The `macSecretBase64` returned when the webhook was created
- A Personal Access Token with `webhook:manage`, `data.records:read`, `schema.bases:read`

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

3. Add your `AIRTABLE_MAC_SECRET_BASE64` and `AIRTABLE_PERSONAL_ACCESS_TOKEN` to `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Endpoint: `POST http://localhost:8000/webhooks/airtable`

The handler reads the **raw** body, verifies `X-Airtable-Content-MAC` (HMAC-SHA256 over
the raw body, keyed on the base64-decoded secret, hex, `hmac-sha256=` prefix), and
responds **200 with an empty body**.

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 8000 airtable --path /webhooks/airtable
```

Set your webhook's `notificationUrl` to the printed URL, then edit a record to trigger it.

## Test

```bash
pytest test_webhook.py -v
```

Tests generate valid signatures with Airtable's algorithm and assert 400/200 responses
plus the payload summarizer.
