# Customer.io Webhooks - FastAPI Example

Minimal example of receiving Customer.io Reporting Webhooks with `X-CIO-Signature` verification.

## Prerequisites

- Python 3.9+
- A Customer.io workspace with a Reporting Webhook and its signing key

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

3. Add your Customer.io webhook signing key to `.env`:
   ```bash
   CUSTOMERIO_WEBHOOK_SIGNING_KEY=your_signing_key
   ```
   Find it on the **Reporting Webhooks** integration page in Customer.io account settings.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook route is `POST /webhooks/customerio` at http://localhost:8000.

## Test

Run the automated tests (they generate real `v0:<timestamp>:<body>` HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

## Receive Real Webhooks Locally

Expose your local server with the Hookdeck CLI (no account required, no install needed):

```bash
npx hookdeck-cli listen 8000 customerio --path /webhooks/customerio
```

The CLI prints a public URL — set it as the **Endpoint URL** in your Customer.io Reporting
Webhook configuration.

## How Verification Works

Customer.io does not ship an SDK webhook helper, so this example verifies manually: it reads the
**raw** body with `await request.body()`, recomputes HMAC-SHA256 over
`v0:<X-CIO-Timestamp>:<raw body>`, and compares it (timing-safe, hex) against `X-CIO-Signature`.
See [../../references/verification.md](../../references/verification.md) for details.
