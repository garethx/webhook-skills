# Setting Up Alipay (Antom / Alipay+) Webhooks

## Prerequisites

- An **Antom** (or Alipay+) merchant account with Dashboard access.
- Your application's public HTTPS webhook endpoint URL.
- An RSA key pair for your account (2048-bit). Antom supports self-generated
  keys or Dashboard-generated keys.

## Understand the Two Keys

Alipay's scheme is **asymmetric**, so there are two distinct keys — don't mix
them up:

| Key | Who holds it | Used for |
|-----|--------------|----------|
| **Your merchant private key** | You (secret) | Signing requests to Antom **and signing the ack response** to notifications |
| **Antom / Alipay+ public key** | Provided in the Dashboard | **Verifying** the `Signature` on inbound notifications |

There is **no shared symmetric "webhook secret"** — verification uses Antom's
public key, not an HMAC secret.

## Get Your Keys

1. Go to the **Antom Dashboard → Developer / Integration Settings**.
2. Under **Keys** (a.k.a. "Integration Info" / "Encryption"):
   - Upload your **merchant public key** (Antom uses it to verify your API
     requests) and keep the matching **private key** in your app's secrets.
   - Copy the **Antom / Alipay+ public key** — this is what your webhook handler
     uses to verify inbound notification signatures.
3. Note your **Client ID** (looks like `SANDBOX_5YC47N2ZQHJ004124` in sandbox,
   or a production equivalent). It appears in the `Client-Id` header of every
   notification and in your signed ack.

Store them as environment variables:

```bash
ALIPAY_CLIENT_ID=SANDBOX_5YC47N2ZQHJ004124
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"           # Antom/Alipay+ public key
ALIPAY_MERCHANT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"  # your private key
```

> **PEM in `.env`:** store the PEM as a single line with literal `\n` between
> lines; the example code calls `.replace(/\\n/g, '\n')` to restore real
> newlines before use.

## Register Your Notify URL

Unlike providers that register one endpoint in a dashboard, Antom lets you set
the notification URL **per API call**:

- **Payments & captures** — pass `paymentNotifyUrl` in `pay()` or
  `createPaymentSession()`.
- **Refunds** — pass `refundNotifyUrl` in `refund()`.

```jsonc
// Example: pay() request body (excerpt)
{
  "paymentRequestId": "pay_20260724_0001",
  "paymentNotifyUrl": "https://your-app.com/webhooks/alipay",
  "paymentAmount": { "value": "8000", "currency": "USD" }
  // ...
}
```

A **Dashboard-level notification URL** exists as a fallback (Developer →
Notification URL), but any per-call `paymentNotifyUrl` / `refundNotifyUrl`
**takes precedence**.

## Test Mode vs Live Mode

- Use your **SANDBOX** Client ID and the sandbox base URL while integrating.
  Sandbox Client IDs are prefixed `SANDBOX_`.
- Sandbox and production have **separate key pairs** — regenerate/copy keys when
  you promote to production.
- Trigger a real notification by creating a sandbox payment and completing it in
  the sandbox cashier; Antom will POST the notification to your `paymentNotifyUrl`.

## Local Testing

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 alipay --path /webhooks/alipay
```

Use the printed URL as your `paymentNotifyUrl` when creating a sandbox payment.

## Acknowledgement Requirements

Your endpoint must respond **HTTP 200** with the signed `SUCCESS` body (see
[verification.md](verification.md)). If it doesn't, Antom retries the
notification **~8 times across 24 hours** (0s, 2m, 10m, 10m, 1h, 2h, 6h, 15h),
so make your processing **idempotent** on `paymentRequestId` / `refundRequestId`.
