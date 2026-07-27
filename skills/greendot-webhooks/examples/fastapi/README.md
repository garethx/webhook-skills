# Green Dot Webhooks - FastAPI Example

Minimal example of receiving Green Dot Embedded Finance (BaaS) webhooks with
OAuth Bearer token authentication and optional `x-gd-signature` verification.

## Prerequisites

- Python 3.10+
- A Green Dot program (endpoint registered by your Green Dot rep) with the OAuth
  token secret, and optionally the `x-gd-signature` signing key

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

3. Set `GREENDOT_WEBHOOK_TOKEN_SECRET` (and optionally `GREENDOT_SIGNING_KEY`)
   in your environment.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at
`POST /webhooks/greendot`.

## How It Works

1. **Authenticate** the OAuth client_credentials Bearer token and require the
   `post:webhook` scope (returns `401` otherwise).
2. **Verify** the optional `x-gd-signature` over the raw body when
   `GREENDOT_SIGNING_KEY` is set (returns `400` on mismatch).
3. **Parse** the JSON body and dispatch on `eventType`.
4. **Acknowledge** with `200`, echoing the `x-GD-RequestId` header and returning
   a `responseDetails` body.

> There is no official Green Dot SDK — verification is manual. This example
> validates an HS256 token with a shared secret so it is self-contained. In
> production, validate the token against your authorization server (JWKS / RS256
> or introspection). See
> [../../references/verification.md](../../references/verification.md).

## Test

```bash
pytest test_webhook.py
```

The tests generate real tokens and signatures using the same algorithms as the
handler.

## Local Development

Tunnel Green Dot deliveries to your local server with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 8000 greendot --path /webhooks/greendot
```

No account required — the CLI creates a guest account and provides a local
tunnel plus a web UI for inspecting requests.
