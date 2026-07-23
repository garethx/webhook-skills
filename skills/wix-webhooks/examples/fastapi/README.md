# Wix Webhooks - FastAPI Example

Minimal example of receiving Wix webhooks in FastAPI with **manual** JWT signature verification.

Wix delivers each webhook as an HTTP POST whose **entire body is a JWT** signed (RS256) by Wix. Wix has no official Python server SDK, so this example verifies the JWT directly with [PyJWT](https://pyjwt.readthedocs.io/) and your app's public key.

## Prerequisites

- Python 3.10+
- A Wix app with at least one webhook subscribed (see [../../references/setup.md](../../references/setup.md))
- Your app's **public key** and **App ID**

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

3. Add your `WIX_APP_ID` and `WIX_PUBLIC_KEY` to `.env`. Get the public key from **App Dashboard → Webhooks → Get Public Key** and the App ID from the **OAuth** page.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 — webhook endpoint is `POST /webhooks/wix`.

## Test

Run the test suite (generates real RS256-signed JWTs with a test RSA key and verifies them):

```bash
pytest test_webhook.py -v
```

## Receive Webhooks Locally

Use the Hookdeck CLI to tunnel public webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 8000 wix --path /webhooks/wix
```

Use the printed HTTPS URL (with the `/webhooks/wix` path) as the **Callback URL** when creating the webhook in your Wix app dashboard.

## How It Works

1. The route reads the **raw body** (`await request.body()`) — never re-serialized JSON, which would break the signature.
2. `jwt.decode(raw_body, PUBLIC_KEY, algorithms=["RS256"])` verifies the signature (and `exp`) with your public key.
3. The decoded JWT is unwrapped through its two nested `data` strings to get `eventType`, `instanceId`, and the event payload.
4. Invalid signatures return `400`; verified events return `200`.
5. Events are deduplicated on the event `id` because Wix retries and can deliver duplicates out of order.
