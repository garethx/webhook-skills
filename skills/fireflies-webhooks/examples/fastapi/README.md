# Fireflies Webhooks - FastAPI Example

Minimal example of receiving Fireflies.ai **Webhooks V2** with signature
verification (`X-Hub-Signature: sha256=<hex>` over the raw body) using FastAPI.

## Prerequisites

- Python 3.10+
- Fireflies account with a webhook configured on the Webhooks V2 page
- A signing secret is optional in Fireflies, but recommended — without one,
  Fireflies sends no signature header and deliveries cannot be verified

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

4. Add your Fireflies webhook signing secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 8000 fireflies --path /webhooks/fireflies
```

Then set the URL the CLI prints as your webhook URL on the Fireflies **Webhooks
V2** page.

## Handled Events

| `event` | Behaviour |
|---------|-----------|
| `meeting.transcribed` | Logs the meeting id and optional `client_reference_id` |
| `meeting.summarized` | Logs that the summary is ready |
| `meeting.bot_joined` | Logs that the notetaker bot joined |

Unknown events are acknowledged with a `200`.

## Unsigned Deliveries

If `FIREFLIES_WEBHOOK_SECRET` is unset, this example logs a loud warning and
accepts the delivery unverified, because Fireflies genuinely sends no signature
when no signing secret is configured. Once a secret is set, every delivery must
carry a valid `sha256=`-prefixed signature or it is rejected with a `401`.

## Endpoint

- `POST /webhooks/fireflies` - Receives and verifies Fireflies webhook events
