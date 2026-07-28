# Praxis Webhooks - FastAPI Example

Minimal FastAPI example of receiving Praxis (Cashier) webhooks with SHA-384
`gt-authentication` signature verification and a signed acknowledgement. Praxis
has no official server SDK, so verification is done manually with Python's
`hashlib`.

## Prerequisites

- Python 3.9+
- A Praxis merchant account and your **Merchant Secret**

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

3. Add your Praxis **Merchant Secret** to `.env` as `PRAXIS_MERCHANT_SECRET`
   (or export it in your shell).

## Run

```bash
export PRAXIS_MERCHANT_SECRET=your_merchant_secret
uvicorn main:app --reload --port 8000
```

The handler receives webhooks at `POST http://localhost:8000/webhooks/praxis`.

## Test

```bash
pytest test_webhook.py
```

The tests generate real SHA-384 signatures and assert the signed acknowledgement.

## Receive live webhooks locally

```bash
npx hookdeck-cli listen 8000 praxis --path /webhooks/praxis
```

Register the printed URL as your Praxis **Notification URL**.

## How verification works

The endpoint reads the raw body, parses the JSON to rebuild the signed
field-value string, recomputes `sha384(values + merchant_secret)`, and compares it
with `hmac.compare_digest` (timing-safe). The `200` reply is a
`{"status": 0, "timestamp": ...}` body signed with the
`external-request-signature` header. See
[../../references/verification.md](../../references/verification.md) for details.
