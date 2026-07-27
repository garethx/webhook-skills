# TikTok Webhooks - FastAPI Example

Minimal example of receiving TikTok for Developers webhooks with
`TikTok-Signature` verification.

> Not TikTok Shop — those use a different portal and signature scheme.

## Prerequisites

- Python 3.10+
- A [TikTok for Developers](https://developers.tiktok.com/) app with a **client
  secret**

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

3. Add your app's **client secret** to `.env` as `TIKTOK_CLIENT_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook route is served at `POST http://localhost:8000/webhooks/tiktok`.

## Test

Run the unit tests (they generate real `TikTok-Signature` values):

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

Start a tunnel (no account required) and point it at your local handler:

```bash
npx hookdeck-cli listen 8000 tiktok --path /webhooks/tiktok
```

Register the printed public HTTPS URL (with `/webhooks/tiktok` appended) as your
callback URL in the TikTok developer portal and subscribe to events.

## How It Works

- The handler reads the **raw body** via `await request.body()` (never parse JSON
  before verifying).
- It computes `HMAC-SHA256(client_secret, "<ts>.<raw_body>")` (hex), rejects
  stale timestamps, and compares to the `s` value from `TikTok-Signature`
  (401 on mismatch).
- After verifying, it parses the envelope and the `content` JSON string, then
  dispatches on `event` and returns **200** quickly.

See [../../references/verification.md](../../references/verification.md) for details.
