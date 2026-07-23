# Twitch Webhooks - FastAPI Example

Minimal example of receiving Twitch EventSub webhooks with FastAPI, including
manual signature verification, the verification-challenge handshake, and event
dispatch. Twitch has no official server SDK, so verification is done manually.

## Prerequisites

- Python 3.9+
- A Twitch application (Client ID + Secret) and an EventSub subscription secret

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

3. Add your Twitch EventSub subscription secret to `.env` as
   `TWITCH_WEBHOOK_SECRET`. This is the value you pass as `transport.secret`
   when creating the subscription via `POST /helix/eventsub/subscriptions`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook is served at `POST http://localhost:8000/webhooks/twitch`.

## Receive Webhooks Locally

Twitch requires an HTTPS callback on port 443. Tunnel to your local server with
the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 twitch --path /webhooks/twitch
```

Use the printed HTTPS URL as the `callback` when you create the subscription.
Twitch will immediately send a `webhook_callback_verification` request — this
handler verifies the signature and echoes back the `challenge`.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate real Twitch signatures (HMAC-SHA256 over
`messageId + timestamp + body`) and cover the challenge handshake,
notifications, revocation, and replay protection.
