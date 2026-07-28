# CloudSignal Webhooks - FastAPI Example

Minimal example of receiving CloudSignal (Cloudprinter.com) webhooks and
authenticating them via the `apikey` field in the JSON body.

> **CloudSignal has no HMAC signature.** Each POST carries a plaintext,
> per-endpoint **Webhook API key** in the JSON body's `apikey` field. The handler
> compares it against `CLOUDSIGNAL_WEBHOOK_APIKEY` with a timing-safe comparison.
> There is no signature header, no timestamp, and it is **not** Standard Webhooks.

## Prerequisites

- Python 3.9+
- A Cloudprinter.com account with a CloudSignal webhook endpoint registered, and
  its **Webhook API key** (from the Cloudprinter.com Dashboard)

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

3. Add your CloudSignal **Webhook API key** to `.env` as `CLOUDSIGNAL_WEBHOOK_APIKEY`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests:

```bash
pytest test_webhook.py -v
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 cloudsignal --path /webhooks/cloudsignal
```

## Endpoint

- `POST /webhooks/cloudsignal` - Authenticates on the body `apikey`, dispatches on the signal `type`
