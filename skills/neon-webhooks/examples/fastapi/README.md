# Neon Webhooks - FastAPI Example

Minimal example of receiving Neon Auth webhooks with Ed25519 / detached JWS signature
verification in FastAPI.

## Prerequisites

- Python 3.9+
- A Neon project with Neon Auth enabled

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

3. Set `NEON_AUTH_URL` in `.env` to your Neon Auth domain. The JWKS (public keys) are
   fetched from `${NEON_AUTH_URL}/.well-known/jwks.json` — there is **no signing secret**.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is served at `POST /webhooks/neon`
(http://localhost:8000/webhooks/neon).

## How Verification Works

There is no off-the-shelf SDK for Neon's scheme, so this example verifies manually with the
`cryptography` library. It:

1. Reads the raw request body (`await request.body()`).
2. Parses the detached JWS from `X-Neon-Signature` (`header..signature`).
3. Fetches the public key from the JWKS by `X-Neon-Signature-Kid` (cached by `kid`).
4. Reconstructs the signing input with **double base64url** encoding and verifies the
   Ed25519 signature.
5. Enforces a 5-minute timestamp tolerance against `X-Neon-Timestamp` (milliseconds).

See [../../references/verification.md](../../references/verification.md) for details.

## Test

Run the included tests (they generate a real Ed25519 keypair, expose it as a JWKS, and
sign requests exactly as Neon does):

```bash
pytest test_webhook.py -v
```

## Local Development

Receive live webhooks on your machine with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 neon --path /webhooks/neon
```

Point a Neon Auth **development branch's** webhook URL at the tunnel URL the CLI prints.
