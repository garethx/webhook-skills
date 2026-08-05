# Vapi Webhooks - FastAPI Example

Receiving Vapi **Server URL** webhooks in FastAPI, authenticating with a shared
secret, and returning the JSON body Vapi requires for its four request/response
message types.

> **Vapi has no fixed HMAC signature.** The recommended auth is a shared secret in
> a header: `Authorization: Bearer <token>` or the legacy `X-Vapi-Secret: <token>`.
> The handler reads whichever is present and compares it against
> `VAPI_WEBHOOK_SECRET` with a timing-safe comparison (`hmac.compare_digest`). See
> the skill's `references/verification.md` for the OAuth 2.0 and configurable-HMAC
> options.

## Prerequisites

- Python 3.9+
- A Vapi account with a Server URL and an attached credential's shared secret

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Vapi shared secret to `.env` as `VAPI_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

## Test

```bash
pytest
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 vapi --path /webhooks/vapi
```

## Endpoint

- `POST /webhooks/vapi` - Authenticates on the shared-secret header, dispatches on
  `message.type`, and returns the required JSON body for the request/response
  types.
