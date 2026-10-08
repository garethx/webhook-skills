# Volume Webhooks - FastAPI Example

Minimal example of receiving [Volume](https://getvolume.com) pay-by-bank
webhooks with signature verification. It checks the `Authorization:
SHA256withRSA <signature>` header, an RSA PKCS#1 v1.5 / SHA-256 signature over
the raw body, against Volume's public key.

## Prerequisites

- Python 3.9+
- A Volume merchant account (sandbox or live). There's no signing secret: the
  example fetches Volume's public key itself.

## Setup

1. Install dependencies:

   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set `VOLUME_ENV` to `sandbox` or `live`. The example fetches the matching
   public key and caches it for an hour:
   - sandbox: `https://api.sandbox.volumepay.io/.well-known/signature/pem`
   - live: `https://api.volumepay.io/.well-known/signature/pem`

   Optionally set `VOLUME_PEM_URL` (explicit URL) or `VOLUME_PUBLIC_KEY`
   (literal key, no fetch).

## Run

```bash
python main.py
```

Server runs on http://localhost:8000. The endpoint is `PUT /webhooks/volume`
(`POST` is also accepted).

## Test

```bash
pytest test_webhook.py
```

The tests:

- verify Volume's two published, sandbox-signed test calls (`COMPLETED` and
  `FAILED`) against the sandbox public key, and show that PSS padding, a
  one-byte change, re-serialised JSON and the live key all fail
- sign payloads with a locally generated RSA-2048 key, the same way Volume
  does, to cover the endpoint: `PUT` and `POST`, `COMPLETED` then `SETTLED`,
  duplicates, amount mismatches, missing or malformed headers, and fail-closed
  behaviour when the key can't be fetched

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 volume --path /webhooks/volume
```

No account required. Set the printed URL as the webhook URL in your Volume
sandbox application configuration, or send one of the sandbox-signed `curl`
calls from [Volume's webhook docs](https://docs.getvolume.com/payments/payment-resources/webhooks)
to it with `VOLUME_ENV=sandbox`.

## What the handler does

1. Resolves Volume's public key. If it's unavailable, it returns `503` so
   Volume retries later.
2. Verifies the signature over the **raw** body. On failure it returns `400`.
3. Parses the JSON, then dedupes on `paymentId` + `paymentStatus`. A payment
   can send `COMPLETED` and later `SETTLED`, and Volume retries until it gets
   a `200`.
4. Reconciles `amount` (major units), `currency` and `merchantPaymentId`
   against your own payment record. On a mismatch it acknowledges with `200`
   but doesn't fulfil, and logs a warning.
5. Dispatches on `paymentStatus`: `COMPLETED`, `SETTLED` or `FAILED`.

The in-memory `payments` map and `processed` set stand in for your database.
Until you wire `payments` to your real payment records, every webhook is
acknowledged but not processed.

See [../../references/verification.md](../../references/verification.md) for
the signature scheme and debugging tips.
