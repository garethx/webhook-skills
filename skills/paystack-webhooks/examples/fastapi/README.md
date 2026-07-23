# Paystack Webhooks - FastAPI Example

Minimal example of receiving Paystack webhooks with FastAPI. Paystack's SDKs have
no webhook verification helper, so this example verifies the signature
**manually** with Python's `hmac` (HMAC-SHA512, hex, timing-safe compare).

## Prerequisites

- Python 3.10+
- A Paystack account (for your secret key)

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

3. Add your Paystack secret key to `.env` as `PAYSTACK_SECRET_KEY`
   (`sk_test_…` from Dashboard → Settings → API Keys & Webhooks).

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/paystack` (served at
http://localhost:8000/webhooks/paystack).

## Test

```bash
pytest test_webhook.py
```

The tests generate real HMAC-SHA512 signatures and exercise the endpoint.

## Receive Real Webhooks Locally

Use the Hookdeck CLI to tunnel Paystack webhooks to your local server (no
install, no account required):

```bash
npx hookdeck-cli listen 8000 paystack --path /webhooks/paystack
```

Set your Paystack dashboard Webhook URL (Settings → API Keys & Webhooks) to the
tunnel URL the CLI prints, then trigger a test-mode transaction to see events
arrive.

## How It Works

- The handler reads the **raw body** with `await request.body()` before parsing —
  parsing JSON first would break the HMAC.
- `verify_paystack_webhook` recomputes HMAC-SHA512 (hex) over the raw body with
  your secret key and compares it to the `x-paystack-signature` header with
  `hmac.compare_digest` (timing-safe).
- An invalid or missing signature returns **400**; verified events return
  **200**.
- The event type comes from the JSON body's `event` field.
