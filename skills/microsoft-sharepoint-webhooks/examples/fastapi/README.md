# Microsoft SharePoint Webhooks - FastAPI Example

Minimal example of receiving Microsoft SharePoint list webhooks with FastAPI, handling the `validationtoken` handshake and validating `clientState`.

## Prerequisites

- Python 3.9+
- A SharePoint list subscription (see [../../references/setup.md](../../references/setup.md))

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

3. Set `SHAREPOINT_CLIENT_STATE` to the same opaque string you pass as `clientState` when creating the subscription.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

- Handshake + notifications: `POST /webhooks/microsoft-sharepoint`
- Health check: `GET /health`

## How It Works

1. **Validation handshake** — when `?validationtoken=...` is present, the endpoint echoes the token back as `text/plain` with `200` (required within ~5 seconds for the subscription to be created).
2. **clientState** — each notification's `clientState` is compared to `SHAREPOINT_CLIENT_STATE` with `hmac.compare_digest` (timing-safe). Mismatches return `400`.
3. **Thin payload** — notifications carry no change details. In production, call the list GetChanges API with a stored change token to learn what changed.

## Test

```bash
pytest test_webhook.py -v
```

## Local Development

Expose your local server to SharePoint with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 microsoft-sharepoint --path /webhooks/microsoft-sharepoint
```

Use the printed public URL as the `notificationUrl` when you create the subscription.
