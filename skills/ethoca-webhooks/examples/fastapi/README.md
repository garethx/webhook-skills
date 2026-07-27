# Ethoca Webhooks - FastAPI Example

Minimal example of receiving Ethoca Alerts webhooks (Push API) with HTTP Basic
Auth verification.

> **Ethoca Alerts have no HMAC signature.** Authenticity comes from mutual TLS
> (MSSL, Entrust CA) at the transport layer plus HTTP Basic Auth at the
> application layer. This example implements the Basic Auth check; configure mTLS
> at your load balancer / reverse proxy (see the skill's `references/verification.md`).

## Prerequisites

- Python 3.9+
- Ethoca Alerts account with a push endpoint registered by the Customer Delivery Team
- The HTTP Basic Auth username/password agreed during onboarding

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

3. Add your Ethoca Basic Auth credentials to `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests:

```bash
pytest test_webhook.py -v
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 ethoca --path /webhooks/ethoca
```

Note: a tunnel terminates TLS at the tunnel provider, so the real mTLS path
cannot be exercised locally — validate mTLS in a staging environment.

## Endpoint

- `POST /webhooks/ethoca` - Receives and authenticates Ethoca Alerts, dispatches on `alertType`
