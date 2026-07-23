# Fireblocks Webhooks - FastAPI Example

Minimal example of receiving Fireblocks **Webhooks v2** with FastAPI and signature verification (detached JWS / RS512 / JWKS).

## Prerequisites

- Python 3.10+
- A Fireblocks workspace (Sandbox for testing). No signing secret needed — verification uses Fireblocks' public JWKS keys.

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

3. Set `FIREBLOCKS_WEBHOOK_ENV` to match your workspace region (`production`, `eu`, `eu2`, or `sandbox`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/fireblocks` on http://localhost:8000.

## How It Works

- The handler reads the **raw body** via `await request.body()` — required because Fireblocks signs the raw bytes.
- `FireblocksVerifier` reconstructs the detached JWS (`header..signature` → `header.<raw body base64url>.signature`) and verifies it against the regional JWKS with `jwcrypto`, pinned to `RS512`.
- There is no official Fireblocks signature-verification helper (the SDK manages webhook *configuration* only), so this manual verification is the recommended approach for Python.
- The handler dispatches on `event["eventType"]` and returns `200` to acknowledge.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate a real RSA key pair, inject the public key as a local JWKS via FastAPI's dependency override, and sign detached RS512 JWS signatures the same way Fireblocks does — covering valid, invalid, tampered, wrong-key, and missing-signature cases.

## Local Development

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 fireblocks --path /webhooks/fireblocks
```

Register the printed public URL (with the `/webhooks/fireblocks` path) as your webhook endpoint in the Fireblocks Console → Developer Center → Webhooks (v2).
