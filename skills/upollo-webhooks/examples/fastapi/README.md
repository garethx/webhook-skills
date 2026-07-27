# Upollo Webhooks - FastAPI Example

Minimal example of receiving Upollo webhooks with `Upollo-Signature`
(HMAC-SHA512) verification using FastAPI, dispatching on the recommended
`action` and the raised `flags`.

## Prerequisites

- Python 3.9+
- An Upollo webhook URL + secret created on the Access & Keys page (see the
  skill's `references/setup.md`)

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

4. Add your Upollo webhook secret to `.env` as `UPOLLO_WEBHOOK_SECRET`. Upollo
   generates this when you add your webhook URL under Webhooks on the Access &
   Keys page.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the tests:

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

Forward webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 8000 upollo --path /webhooks/upollo
```

## How It Works

- **Verify** — Upollo signs each delivery with `Upollo-Signature`
  (`t:<ts>,s0:<hmac-sha512>`). The handler reads the raw body via
  `await request.body()`, recomputes `HMAC-SHA512`, and constant-time compares
  it to `s0` before processing.
- **Dispatch** — After verifying, the handler iterates `flags[]` (e.g.
  `ACCOUNT_SHARING`, `MULTIPLE_ACCOUNTS`) and acts on the recommended `action`
  (`CHALLENGE`, `DENY`, `PERMIT`, `OFFER`, `LOG`).

> Verification uses only the Python standard library. The `upollo-python` SDK is
> an analysis client and does **not** verify webhooks, so it is not required.

## Endpoint

- `POST /webhooks/upollo` - Verifies and processes the analysis
