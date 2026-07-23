# Sanity Webhooks - FastAPI Example

Minimal example of receiving Sanity GROQ-powered webhooks with **manual**
signature verification (there is no official Python SDK, so this replicates the
`@sanity/webhook` algorithm).

## Prerequisites

- Python 3.9+
- A Sanity project with a webhook configured at [sanity.io/manage](https://www.sanity.io/manage)
  and its signing secret

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

4. Add your Sanity webhook signing secret to `.env` as `SANITY_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Receive real webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 sanity --path /webhooks/sanity
```

The CLI prints a public URL — set it as the webhook **URL** at sanity.io/manage,
then edit a matching document in the Studio to trigger a delivery.

## Endpoint

- `POST /webhooks/sanity` - Verifies the `sanity-webhook-signature` header and
  dispatches on the document `_type`.

## How It Works

- The handler reads the **raw** body with `await request.body()` — required
  because the signature is an HMAC over the raw bytes.
- `is_valid_signature()` parses the `t=<ms-timestamp>,v1=<sig>` header, recomputes
  the HMAC-SHA256 over `` `${timestamp}.${raw_body}` ``, base64url-encodes it (no
  padding), and compares timing-safely with `hmac.compare_digest`.
- After verification, the body is parsed and dispatched on `_type`
  (`post`, `author`, `product`, `category`, `page`).
