# Circle Webhooks — FastAPI Example

Minimal FastAPI app that receives Circle Payments Network (CPN) webhooks and
verifies the **ECDSA_SHA_256** signature against Circle's public key.

Circle only ships a Node SDK for its wallet products, so this example uses
**manual verification** with the `cryptography` package — the same algorithm
Circle's own Node/Python docs use.

## Prerequisites

- Python **3.10+**
- A Circle account with a notification subscription — see
  [../../references/setup.md](../../references/setup.md)

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

3. Set `CIRCLE_API_KEY` in `.env` (used to fetch the notification public key by
   its keyId). Set `CIRCLE_API_BASE_URL` to `https://api-sandbox.circle.com`
   when testing against sandbox.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The app exposes:

- `POST /webhooks/circle` — Webhook receiver
- `HEAD /webhooks/circle` — Endpoint validation (Circle sends a HEAD request when a subscription is created/updated)
- `GET  /health` — Liveness check

## Test

```bash
pytest test_webhook.py
```

The test generates an ECDSA P-256 key pair in memory, injects it into the public
key cache, signs a payload with the matching private key, and asserts the app's
responses.

For real end-to-end testing, expose your local server and create a subscription
pointing at the tunnel URL:

```bash
uvicorn main:app --port 8000
npx hookdeck-cli listen 8000 circle --path /webhooks/circle
```

## How Verification Works Here

1. The route reads the request body as raw bytes (`await request.body()`).
2. The `X-Circle-Signature` (base64) and `X-Circle-Key-Id` (UUID) headers are read.
3. The public key for that keyId is fetched from
   `GET /v2/cpn/notifications/publicKey/{keyId}` and cached (base64 DER/SPKI).
4. The signature is verified over the **raw body** with ECDSA using SHA-256.

See [../../references/verification.md](../../references/verification.md) for the
full algorithm and common gotchas.
