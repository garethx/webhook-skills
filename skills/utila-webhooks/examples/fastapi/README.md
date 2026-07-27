# Utila Webhooks - FastAPI Example

Minimal example of receiving Utila webhooks with RSA signature verification in
FastAPI.

## Prerequisites

- Python 3.10+
- A Utila account with a webhook configured in the Console
  (Vault Settings → Webhooks) and its PEM RSA-4096 **public** key

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

3. Add Utila's PEM public key to `.env` as `UTILA_WEBHOOK_PUBLIC_KEY`. There is
   no shared secret — verification uses only the public key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/utila`.

## How It Works

- The handler reads the raw bytes with `await request.body()` — the RSA signature
  is computed over the exact raw body, so it must not be parsed to JSON first.
- `verify_utila_signature()` verifies the base64 `x-utila-signature` header with
  the `cryptography` library (SHA-512 + PSS padding, `PSS.AUTO` salt length).
- Invalid or missing signatures return **400**; verified events return **200** so
  Utila stops retrying.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate an RSA key pair and sign payloads with SHA-512 + PSS exactly
the way Utila does, then assert the handler accepts valid signatures and rejects
missing, invalid, and tampered ones.

## Local Development

Tunnel live Utila deliveries to your machine with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 8000 utila --path /webhooks/utila
```

Point the Console webhook URL at the tunnel URL the CLI prints. No account
required — the CLI creates a guest account on first run.
