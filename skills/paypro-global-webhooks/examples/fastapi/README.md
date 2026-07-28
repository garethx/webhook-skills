# PayPro Global Webhooks - FastAPI Example

Minimal example of receiving PayPro Global IPN (Instant Payment Notification)
webhooks with `SIGNATURE` (SHA256) and `HASH` (MD5) verification.

## Prerequisites

- Python 3.10+
- A PayPro Global vendor account with the **Validation Key** and **Secret Key**
  from **Store Settings → General Settings → Integration**

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

3. Set `PAYPRO_VALIDATION_KEY` (for `SIGNATURE`) and, optionally,
   `PAYPRO_SECRET_KEY` (for `HASH`) in your environment. These are **two
   different keys**.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at
`POST /webhooks/paypro-global`.

## How It Works

1. **(Optional) IP allowlist** — when `PAYPRO_ENFORCE_IP=true`, reject requests
   whose source IP is not one of PayPro Global's fixed addresses (`403`).
2. **Verify `SIGNATURE`** (SHA256, primary) — recompute from the parsed form
   field values and compare timing-safely (`400` on mismatch).
3. **Verify `HASH`** (MD5, secondary) — enforced only when `PAYPRO_SECRET_KEY`
   is set (`400` on mismatch).
4. **Dispatch** on `IPN_TYPE_NAME` and respond `200` to acknowledge.

PayPro Global posts `application/x-www-form-urlencoded` — the body is parsed with
`await request.form()` (this needs the `python-multipart` package, included in
`requirements.txt`). The `SIGNATURE` covers specific field **values**, not the
raw body, so parsing first is correct here.

> PayPro Global has **no official SDK** — verification is manual. See
> [../../references/verification.md](../../references/verification.md).

## Test

```bash
pytest test_webhook.py
```

The tests generate real `SIGNATURE` and `HASH` values using the same algorithm as
PayPro Global (including the documented examples), and cover valid, tampered,
test-order, and missing-field cases.

## Local Development

Tunnel PayPro Global IPNs to your local server with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 8000 paypro-global --path /webhooks/paypro-global
```

No account required — the CLI creates a guest account and provides a local tunnel
plus a web UI for inspecting requests.
