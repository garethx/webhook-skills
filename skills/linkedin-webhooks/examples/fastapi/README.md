# LinkedIn Webhooks - FastAPI Example

Minimal example of receiving LinkedIn webhooks with **endpoint validation** (GET challenge) and **signature verification** (POST `X-LI-Signature`).

## Prerequisites

- Python 3.9+
- A LinkedIn app with an approved webhook use case and its **Client Secret**

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

3. Add your LinkedIn app client secret to `.env` as `LINKEDIN_CLIENT_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Endpoints

- `GET /webhooks/linkedin` — endpoint validation. Echoes `challengeCode` with a computed `challengeResponse` (answer within 3s).
- `POST /webhooks/linkedin` — event delivery. Verifies `X-LI-Signature`, dedupes on `notificationId`, dispatches on notification type.

## Test

### Run the unit tests

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

LinkedIn requires HTTPS and does not support ngrok. Use the Hookdeck CLI:

```bash
npx hookdeck-cli listen 8000 linkedin --path /webhooks/linkedin
```

## How verification works

LinkedIn has no webhook-verification SDK, so verify manually. Both checks are HMAC-SHA256 keyed with your `clientSecret`, hex-encoded:

- **Challenge:** `hex(HMACSHA256(challengeCode, clientSecret))`
- **Signature:** `hex(HMACSHA256("hmacsha256=" + rawBody, clientSecret))` — the `hmacsha256=` prefix is only in the string-to-sign, not the header.

See [../../references/verification.md](../../references/verification.md) for details.
