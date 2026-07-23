# Revolut Webhooks - FastAPI Example

Minimal example of receiving Revolut Merchant webhooks with signature
verification in FastAPI.

## Prerequisites

- Python 3.10+
- A Revolut Merchant account and a webhook created via the Merchant API (see
  [../../references/setup.md](../../references/setup.md)) with its
  `signing_secret` (starts with `wsk_`)

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

3. Add your Revolut webhook signing secret to `.env`:
   ```bash
   REVOLUT_SIGNING_SECRET=wsk_xxxxx
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/revolut`.

## Receive webhooks locally

Use the Hookdeck CLI to tunnel Revolut webhooks to your local server (no account
required — it creates a guest account on first run):

```bash
npx hookdeck-cli listen 8000 revolut --path /webhooks/revolut
```

Point your Revolut webhook `url` at the URL Hookdeck prints.

## How verification works

- The handler reads the **raw** body with `await request.body()` — verify before
  parsing JSON, or a re-serialized body will break the signature.
- It recomputes `HMAC-SHA256("v1.{timestamp}.{raw body}", signing_secret)` and
  compares it with `hmac.compare_digest` against the `Revolut-Signature` header.
- The `Revolut-Signature` header may hold multiple comma-separated signatures
  during secret rotation; any match is accepted.

Revolut has no official Python SDK with a webhook helper, so verification is
done manually. See
[../../references/verification.md](../../references/verification.md) for details.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate real signatures with Revolut's algorithm and cover valid,
invalid, tampered, stale-timestamp, and rotation (multi-signature) cases.
