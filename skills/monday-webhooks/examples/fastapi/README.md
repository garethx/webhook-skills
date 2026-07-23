# monday.com Webhooks - FastAPI Example

Minimal example of receiving monday.com webhooks: the `challenge` handshake plus
JWT verification of the `Authorization` header.

## Prerequisites

- Python 3.10+
- A monday.com app with a **Signing Secret** (Developer Center → your app → Basic Information)

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

3. Add your monday.com **Signing Secret** to `.env` as `MONDAY_SIGNING_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook route is available at http://localhost:8000/webhooks/monday

## How It Works

1. **Challenge handshake** — echoes `{ "challenge": "…" }` back on registration
   (no JWT required for this step).
2. **JWT verification** — verifies the HS256 JWT in the `Authorization` header with
   your Signing Secret using PyJWT. Invalid/missing → 401.
3. **Event dispatch** — switches on `event["type"]`.

> monday.com has no official webhook-verification SDK, so this example uses `PyJWT`.
> The JWT does not sign the request body, so JSON is parsed before verification —
> see [../../references/verification.md](../../references/verification.md).

## Test

### Run the test suite

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 monday --path /webhooks/monday
```

Point your webhook `url` at the public URL the CLI prints, then edit an item on the
board to trigger events.

## Endpoint

- `POST /webhooks/monday` - Handles the challenge handshake and verified events
- `GET /health` - Health check
