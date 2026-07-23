# Smartcar Webhooks - FastAPI Example

Minimal example of receiving Smartcar webhooks in FastAPI, with `SC-Signature`
verification and VERIFY-challenge handling.

## Prerequisites

- Python 3.9+
- A Smartcar Dashboard account and an **Application Management Token** (AMT)

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

3. Add your Application Management Token to `.env` as
   `SMARTCAR_MANAGEMENT_TOKEN`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is served at http://localhost:8000/webhooks/smartcar

## Test

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 smartcar --path /webhooks/smartcar
```

Use the printed HTTPS URL as your Callback URI in the Smartcar Dashboard. On
save, Smartcar sends a `VERIFY` event — this handler answers it automatically so
the webhook activates.

## How it works

- `POST /webhooks/smartcar` — receives Smartcar webhook events
  - `VERIFY` → responds `200 {"challenge": hash_challenge(AMT, data.challenge)}`
  - `VEHICLE_STATE` / `VEHICLE_ERROR` → verifies the `SC-Signature` header
    (hex HMAC-SHA256 of the raw body) via the Smartcar SDK, returns `401` if it
    fails, otherwise processes and returns `200`
- `GET /health` — health check

Verification uses the official [`smartcar`](https://pypi.org/project/smartcar/)
Python SDK (`verify_payload`, `hash_challenge`), hashing the **raw request body**
string.
