# Cisco Meraki Webhooks - FastAPI Example

Minimal example of receiving Cisco Meraki Dashboard webhook alerts with FastAPI
and verifying the `sharedSecret` in the request body.

> Meraki has **no HMAC signature header**. The "Shared secret" you set on the
> HTTP server is echoed back inside the JSON body as `sharedSecret`; you verify
> with a timing-safe string compare (`hmac.compare_digest`). TLS is the real
> transport protection.

## Prerequisites

- Python 3.9+
- A Meraki HTTP server configured with a **Shared secret**
  (Dashboard → Network-wide → Alerts → Webhooks)

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

3. Set `MERAKI_WEBHOOK_SECRET` in `.env` to the exact "Shared secret" from your
   Meraki HTTP server.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook is served at `POST http://localhost:8000/webhooks/meraki`.

## Test

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 meraki --path /webhooks/meraki
```

Point your Meraki HTTP server URL at the tunnel URL the CLI prints, then click
**Send test** on the HTTP server in the Dashboard.
