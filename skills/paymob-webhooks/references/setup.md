# Setting Up Paymob Webhooks

## Prerequisites

- A Paymob merchant account with access to the dashboard
- Your application's publicly reachable webhook endpoint URL
  (e.g. `https://your-app.com/webhooks/paymob`)

## Get Your HMAC Secret

Paymob signs every callback with an **HMAC secret** (not your API key or secret
key). Find it in the dashboard:

1. Log in to the Paymob dashboard.
2. Go to **Settings → Account Info** (in some regions: **Developers → Payment
   Integrations**).
3. Copy the **HMAC** value.
4. Store it as `PAYMOB_HMAC_SECRET` in your environment — never commit it.

> The HMAC secret is account-wide. The same secret verifies both the Transaction
> Processed (POST) and Transaction Response (GET) callbacks.

## Register Your Callback URLs

Callbacks are configured **per payment integration**:

1. Go to **Developers → Payment Integrations** (or **Settings → Payment
   Integrations**).
2. Select the integration you use to create payment keys.
3. Set both callback URLs to your endpoint:
   - **Transaction Processed Callback** (server-to-server POST) →
     `https://your-app.com/webhooks/paymob`
   - **Transaction Response Callback** (browser redirect GET) →
     `https://your-app.com/webhooks/paymob` (or a dedicated result page)
4. Save.

Both callbacks append the signature as a query parameter: `?hmac=<hex>`.

## How the `hmac` Parameter Arrives

- **Transaction Processed Callback (POST):** JSON body plus `?hmac=<hex>` on the
  URL. Read the signature from the query string, not a header.
- **Transaction Response Callback (GET):** all transaction fields **and** `hmac`
  are query parameters.

There is **no signature header** — always read `hmac` from the query string.

## Test Mode vs Live Mode

- Use your **test/staging integration** first: it has its own integration ID and
  uses the same HMAC scheme, so verification code is identical.
- Trigger a real test transaction (Paymob provides test card numbers) and watch
  your endpoint receive the POST callback.
- Confirm your computed HMAC matches the `hmac` query parameter before moving to
  the live integration.

## Local Testing

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 paymob --path /webhooks/paymob
```

Use the printed URL as your callback URL in the Paymob dashboard while
developing. See [verification.md](verification.md) for how to confirm signatures.
