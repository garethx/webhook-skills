# Xero Webhooks - FastAPI Example

Minimal example of receiving Xero webhooks with `x-xero-signature` verification using FastAPI, including passing Xero's Intent to Receive (ITR) validation.

## Prerequisites

- Python 3.9+
- A Xero app with a **webhook signing key** (Webhooks tab at [developer.xero.com/app/manage](https://developer.xero.com/app/manage))

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Xero webhook signing key to `.env` as `XERO_WEBHOOK_KEY`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 xero --path /webhooks/xero
```

Put the printed URL (with `/webhooks/xero`) in your app's **Delivery URL** field, then click **Send "Intent to receive"** in the Xero portal.

## How verification works

- The handler reads the **raw** body with `await request.body()` before parsing.
- Xero signs the raw body with HMAC-SHA256 using your signing key, base64-encoded, in `x-xero-signature`.
- Returns **200** for a valid signature and **401** for an invalid one — exactly what ITR requires. Return `401` (not `400`) for bad signatures, or ITR fails and the webhook stays inactive.

## Endpoint

- `POST /webhooks/xero` - Receives, verifies, and dispatches Xero webhook events
- `GET /health` - Health check
