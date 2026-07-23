# RingCentral Webhooks - FastAPI Example

Minimal example of receiving RingCentral webhooks with FastAPI, handling the
Validation-Token handshake and the optional Verification-Token check.

## Prerequisites

- Python 3.9+
- A RingCentral app + subscription pointed at your endpoint (see
  [../../references/setup.md](../../references/setup.md))

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

3. (Optional) Add your `RINGCENTRAL_VERIFICATION_TOKEN` to `.env` — the same value
   you set as `verificationToken` on the subscription.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (provides the required HTTPS address)
npx hookdeck-cli listen 8000 ringcentral --path /webhooks/ringcentral
```

Use the Hookdeck HTTPS URL as the `deliveryMode.address` when creating your
RingCentral subscription.

### Run the automated tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/ringcentral` - Handles the handshake and verifies notifications
- `GET /health` - Health check
