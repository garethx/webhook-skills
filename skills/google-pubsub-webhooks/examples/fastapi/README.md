# Google Cloud Pub/Sub Webhooks - FastAPI Example

Minimal example of receiving Google Cloud Pub/Sub **push subscription** messages
with FastAPI, verifying the OIDC token Pub/Sub attaches with the official
[`google-auth`](https://google-auth.readthedocs.io/) library.

## Prerequisites

- Python 3.9+
- A Google Cloud project with a Pub/Sub topic and a push subscription
  (see [../../references/setup.md](../../references/setup.md))

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

3. Set `PUBSUB_AUDIENCE` and `PUBSUB_SERVICE_ACCOUNT_EMAIL` in `.env` to match
   your push subscription.

   There is **no signing secret** — Pub/Sub does not have one. Authenticity
   comes from a Google-signed OIDC JWT in the `Authorization` header.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The webhook endpoint is
`POST /webhooks/google-pubsub`.

## Receive webhooks locally

Pub/Sub only pushes to a publicly reachable HTTPS URL. Start a tunnel with the
Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 google-pubsub --path /webhooks/google-pubsub
```

Use the printed HTTPS URL as the subscription's `--push-endpoint`. If the
subscription has no explicit `--push-auth-token-audience`, the audience **is**
that full URL — set `PUBSUB_AUDIENCE` to it exactly, including the path.

Then publish a message:

```bash
gcloud pubsub topics publish my-topic \
  --message='{"orderId":"123","total":4995}' \
  --attribute=eventType=order.created
```

## How it works

1. Authenticates the request **before** parsing anything:
   - `id_token.verify_oauth2_token()` verifies the RS256 signature against
     Google's public keys and checks `aud` and `exp`.
   - The handler then checks `iss`, `email`, and `email_verified` itself — the
     library does not, and without the `email` check any Google-signed token
     with the right audience would pass.
2. Optionally compares a `?token=` query parameter for subscriptions that cannot
   use OIDC (a DIY convention, not a Google scheme).
3. Fails closed: with no authentication configured it returns 500 until
   `PUBSUB_ALLOW_UNAUTHENTICATED=true` is set explicitly, which is what the
   Pub/Sub emulator needs.
4. Parses the push envelope, optionally rejecting an unexpected `subscription`.
5. Base64-decodes `message.data`, handling the case where it is **absent**
   (attribute-only messages) or not JSON.
6. Responds `204` to ack. Any non-2xx — or exceeding the ack deadline (default
   10s) — is a nack and Pub/Sub redelivers.

Note there is no raw-body handling. The OIDC token authenticates the caller, not
the body, so parsing JSON first is correct for Pub/Sub.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate a throwaway RSA key pair, sign **real RS256 OIDC tokens** with
`google-auth`'s own signer, and patch only the call that fetches Google's public
keys, so the library performs a genuine signature verification. They cover valid
tokens, wrong audience, wrong service account, unverified email, non-Google
issuer, expired tokens, tampered signatures and payloads, unknown key ids,
attribute-only and non-JSON messages, malformed envelopes, subscription
allowlisting, the `?token=` fallback, and the fail-closed configuration path.
