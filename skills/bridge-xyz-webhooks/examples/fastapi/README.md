# Bridge (bridge.xyz) Webhooks - FastAPI Example

Minimal example of receiving Bridge webhooks with RSA-SHA256 signature
verification. Bridge has no Python SDK, so verification is done manually with the
`cryptography` library.

## Prerequisites

- Python 3.10+
- A Bridge webhook endpoint created via the API, and its `public_key` (PEM)

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

3. Add the endpoint's `public_key` (from the Bridge webhook create/update API
   response) to `BRIDGE_WEBHOOK_PUBLIC_KEY` in `.env`. Store it single-line with
   `\n` escapes — `main.py` converts them back to newlines.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real RSA signatures with a throwaway keypair):

```bash
pytest test_webhook.py -v
```

### Receive live events locally

Use the Hookdeck CLI to tunnel Bridge deliveries to your local server (no account
required):

```bash
npx hookdeck-cli listen 8000 bridge-xyz --path /webhooks/bridge-xyz
```

Point your Bridge webhook `url` at the tunnel URL, then trigger a test delivery:

```bash
curl --request POST \
  --url https://api.bridge.xyz/v0/webhooks/<webhookID>/send \
  --header 'Api-Key: <your-api-key>'
```

## Endpoint

- `POST /webhooks/bridge-xyz` - Receives and verifies Bridge webhook events
- `GET /health` - Health check
