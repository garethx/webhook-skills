# Alipay Webhooks - FastAPI Example

Minimal example of receiving Alipay (Antom / Alipay+) webhooks with FastAPI,
including RSA256 signature verification and a **signed acknowledgement
response**.

## Prerequisites

- Python 3.9+
- An Antom / Alipay+ account with a Client ID, your merchant private key, and
  the Antom/Alipay+ public key (see [../../references/setup.md](../../references/setup.md))

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

3. Fill in `.env`:
   - `ALIPAY_CLIENT_ID` — your Client ID
   - `ALIPAY_PUBLIC_KEY` — Antom/Alipay+ public key (verifies inbound notifications)
   - `ALIPAY_MERCHANT_PRIVATE_KEY` — your private key (signs the ack response)

   Store PEM values on one line with literal `\n` between lines.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Webhook endpoint: `POST http://localhost:8000/webhooks/alipay`

## Test locally

```bash
npx hookdeck-cli listen 8000 alipay --path /webhooks/alipay
```

Use the printed URL as your `paymentNotifyUrl` when creating a sandbox payment.

## Run the tests

```bash
pytest test_webhook.py
```

The tests use `cryptography` to generate real RSA256 signatures and assert the
ack response is correctly signed with the merchant key.

## How it works

1. `await request.body()` reads the **raw** body — the signature covers those bytes.
2. The `Signature` / `Client-Id` / `Request-Time` headers are parsed; the
   two-line content is verified with Antom's public key (SHA256withRSA, base64URL).
3. On success the handler branches on `notifyType` and returns a **signed** 200
   `SUCCESS` ack so Antom stops retrying.

There is no official Alipay SDK helper for notification verification here, so
verification is done manually with `cryptography` (the standard SHA256withRSA
algorithm). See [../../references/verification.md](../../references/verification.md).
