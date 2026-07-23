# Tally Webhooks - FastAPI Example

Minimal example of receiving Tally webhooks with `Tally-Signature` verification.

## Prerequisites

- Python 3.10+
- A Tally form with a webhook configured (optionally with a signing secret)

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

3. Add your Tally webhook signing secret to `.env` as `TALLY_SIGNING_SECRET`.
   (Signing is optional in Tally — if you leave it unset, the handler processes
   unsigned requests and logs a warning. Set it for production.)

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/tally` on http://localhost:8000.

## Test

```bash
pytest test_webhook.py -v
```

Tests generate real HMAC-SHA256 signatures and exercise both the signed and unsigned paths.

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 tally --path /webhooks/tally
```

Put the tunnel URL into your form's **Integrations → Webhooks** configuration, then submit the
form to trigger a `FORM_RESPONSE` event.

## How verification works

Tally signs the **raw JSON body** with HMAC-SHA256 keyed on the signing secret and sends the
base64 digest in the `Tally-Signature` header. The handler reads the raw body with
`await request.body()` before parsing, computes `base64(HMAC-SHA256(secret, raw_body))`, and
compares with `hmac.compare_digest`. See
[../../references/verification.md](../../references/verification.md) for details.
