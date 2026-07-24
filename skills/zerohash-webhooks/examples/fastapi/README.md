# Zero Hash Webhooks - FastAPI Example

Minimal example of receiving Zero Hash webhooks with signature verification
using FastAPI. Zero Hash has no webhook SDK, so signatures are verified
**manually** with Python's `hmac` module.

## Prerequisites

- Python 3.9+
- A Zero Hash HMAC webhook shared secret (provisioned by your Zero Hash rep)

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

4. Add your Zero Hash **HMAC shared secret**:
   ```bash
   ZEROHASH_WEBHOOK_SECRET=your_zero_hash_hmac_shared_secret
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is available at
`POST http://localhost:8000/webhooks/zerohash`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures for both the
recommended and legacy schemes):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Zero Hash webhooks to your local server (no
account required):

```bash
npx hookdeck-cli listen 8000 zerohash --path /webhooks/zerohash
```

Give the public URL the CLI prints to your Zero Hash rep as your destination URL.

## How It Works

- The handler reads `await request.body()` to get the **raw body** for signature
  verification (parsing JSON first would break the signature).
- `verify_zerohash()` recomputes the HMAC-SHA256 hex digest. For the recommended
  scheme it signs `payload + timestamp` (from `x-zh-hook-signature` /
  `x-zh-hook-timestamp`) and rejects timestamps outside ±5 minutes; it falls
  back to the legacy `x-zh-hook-signature-256` (payload only) scheme.
- The event type comes from the `x-zh-hook-payload-type` header.
- Invalid, missing, or expired signatures return `400`; verified events return `200`.
