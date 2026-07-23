# Telnyx Webhooks - FastAPI Example

Minimal FastAPI example for receiving Telnyx webhooks with **Ed25519** signature verification,
using [`PyNaCl`](https://pypi.org/project/PyNaCl/).

## Why manual verification?

Telnyx signs every webhook with an **Ed25519** signature over `f"{telnyx-timestamp}|"` + raw body,
using the headers `telnyx-signature-ed25519` (base64) and `telnyx-timestamp` (unix seconds).
The pinned `telnyx` Python SDK's `client.webhooks.unwrap()` is wired to the
[Standard Webhooks](https://www.standardwebhooks.com/) library, which uses different headers and
does not match Telnyx's real scheme — so this example verifies directly with PyNaCl. See
[../../references/verification.md](../../references/verification.md).

## Prerequisites

- Python 3.9+
- Telnyx account with the messaging profile / app configured to send **Webhook API v2** (signed) events
- Your account **Public Key** (base64) from Mission Control → Account Settings → Keys & Credentials → Public Key

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

3. Add your Telnyx account **Public Key** (base64) to `.env`:
   ```bash
   TELNYX_PUBLIC_KEY=eu2zvPjhY6odxV34Z/EsRiERvTodkev4Fq0SlK90Izg=
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000.

## Test

```bash
pytest test_webhook.py -v
```

The test suite generates a real Ed25519 keypair and exercises valid signatures, missing headers,
invalid signatures, body tampering, stale timestamps, and all common event types.

## Webhook Endpoint

```
POST http://localhost:8000/webhooks/telnyx
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 8000 telnyx --path /webhooks/telnyx
```

Paste the public URL into Mission Control → your messaging profile → Outbound / Inbound Webhook URL,
and set the Webhook API version to **v2 (signed)**.
