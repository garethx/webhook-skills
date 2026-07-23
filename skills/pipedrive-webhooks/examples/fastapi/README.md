# Pipedrive Webhooks - FastAPI Example

Minimal example of receiving Pipedrive webhooks with HTTP Basic Auth
verification.

> Pipedrive does **not** sign webhooks (no HMAC, no signature header). It
> authenticates deliveries with the HTTP Basic Auth credentials you configure on
> the webhook. This handler verifies those credentials with a constant-time
> comparison (`hmac.compare_digest`).

## Prerequisites

- Python 3.10+
- A Pipedrive account (to create the webhook and choose Basic Auth credentials)

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

3. Set `PIPEDRIVE_WEBHOOK_USER` and `PIPEDRIVE_WEBHOOK_PASSWORD` in `.env` to the
   same `http_auth_user` / `http_auth_password` you set on the webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 — endpoint `POST /webhooks/pipedrive`.

## Test locally with a tunnel

Pipedrive requires a public HTTPS URL. Expose your local server with the Hookdeck
CLI (no account required):

```bash
npx hookdeck-cli listen 8000 pipedrive --path /webhooks/pipedrive
```

Use the printed HTTPS URL as the webhook's `subscription_url`.

## Test

```bash
pytest test_webhook.py -v
```

The tests build real HTTP Basic Auth headers (`Basic base64(user:password)`) and
assert 401 (bad/missing credentials), 400 (invalid payload), and 200 (valid
delivery).
