# TikTok Shop Webhooks - FastAPI Example

Minimal example of receiving TikTok Shop webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A TikTok Shop Partner Center app with an `app_key` and `app_secret`

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

3. Add your TikTok Shop `app_key` and `app_secret` to `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/tiktok-shop` on
http://localhost:8000.

## How It Works

- The handler reads the **raw** body with `await request.body()` — required
  because the signature covers the exact bytes received.
- It verifies the `Authorization` header: a lowercase-hex **HMAC-SHA256** over
  `app_key + raw_body`, keyed by `app_secret`. No `Bearer` prefix, no timestamp.
  Verification is manual (there is no TikTok Shop webhook SDK helper).
- Invalid or missing signature → **401**. Valid → **200 with an empty body**.
- It resolves the numeric `type` to an event name and dispatches. Dedupe on
  `tts_notification_id` before doing real work (delivery is at-least-once).

## Test

```bash
pytest test_webhook.py
```

The tests generate real signatures with TikTok Shop's algorithm and cover
missing, invalid, tampered, and valid signatures plus event dispatch.

## Local Development

Tunnel public webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 8000 tiktok-shop --path /webhooks/tiktok-shop
```
