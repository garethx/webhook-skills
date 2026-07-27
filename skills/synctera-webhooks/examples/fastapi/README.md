# Synctera Webhooks - FastAPI Example

Minimal example of receiving Synctera webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A Synctera webhook signing secret from `POST /v0/webhook_secrets` (this is **not** your API key)

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

3. Add your Synctera signing secret to `.env` as `SYNCTERA_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/synctera` on http://localhost:8000.

## Test

Run the test suite (generates real Synctera signatures):

```bash
pytest test_webhook.py -v
```

## Receive Real Webhooks Locally

Tunnel Synctera deliveries to your local server with the Hookdeck CLI (no account
required):

```bash
npx hookdeck-cli listen 8000 synctera --path /webhooks/synctera
```

Register the URL Hookdeck prints as your webhook `url` via `POST /v0/webhooks`,
then fire a test event with `POST /v0/webhooks/trigger`.

## Why Manual Verification?

Synctera's only official client library is Go
(`github.com/synctera/client-libraries-go`) — there is no Python SDK for webhook
verification. This example verifies the HMAC-SHA256 signature manually using
Python's standard `hmac` and `hashlib`:

- Headers: `Synctera-Signature` (hex) and `Request-Timestamp` (POSIX seconds)
- Signed string: `` f"{timestamp}.{raw_body}" ``
- The raw request body is used — never the parsed JSON
- Stale timestamps (>5 min) are rejected for replay protection
- During secret rotation, the header may carry two `.`-delimited signatures; the
  handler accepts the body if it matches either

See [../../references/verification.md](../../references/verification.md) for details.
