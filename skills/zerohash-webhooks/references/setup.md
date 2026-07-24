# Setting Up Zero Hash Webhooks

## Prerequisites

- A Zero Hash Platform account with a Zero Hash representative contact
- Your application's public webhook endpoint URL (HTTPS)

## Zero Hash webhooks are not self-service

Unlike most providers, Zero Hash webhook subscriptions are **not** configured in
a dashboard by you. Instead:

1. **Reach out to your Zero Hash representative** and tell them which
   destination URL should receive webhooks and which notifications you want
   (`trade_status_changed`, `account_balance.changed`, or both).
2. Your rep configures your Platform to deliver to that URL.
3. Your rep provisions the signing material:
   - an **HMAC shared secret** (used with `x-zh-hook-signature` /
     `x-zh-hook-signature-256`), and/or
   - an **RSA public key** (`zh-public-key`, used with the RSA signature
     headers) for verifying RSA-signed deliveries.

> The RSA verification key is a dedicated **webhook** public key. It is **not**
> the public key associated with a Zero Hash REST API key — do not reuse API
> credentials to verify webhooks.

## Get Your Signing Secret

The HMAC shared secret is delivered to you by your Zero Hash representative
(there is no self-service "reveal secret" screen). Store it as a secret in your
environment:

```bash
ZEROHASH_WEBHOOK_SECRET=your_zero_hash_hmac_shared_secret
```

Never commit the secret. Rotate it via your Zero Hash rep if it is exposed.

## Webhook signing is different from REST API auth

Zero Hash's REST API uses the `X-SCX-*` headers with a signature over
`timestamp + method + path + body`, base64-encoded. **Webhook signing is a
separate scheme** and does *not* use that format:

- Webhooks are signed with **HMAC-SHA256** (or RSA-SHA256), **hex**-encoded.
- The signed content is `payload + timestamp` (recommended) or `payload` alone
  (legacy) — never method/path.

Do not try to reuse REST API auth code to verify webhooks. See
[verification.md](verification.md).

## Environment (source IP allowlist)

Zero Hash delivers webhooks from a fixed set of source IPs. If your
infrastructure enforces IP allowlisting, allow:

- `18.189.25.175/32`
- `3.18.218.32/32`
- `3.22.145.85/32`

Confirm the current list with your Zero Hash rep, as it may change.

## Test Mode vs Live Mode

Zero Hash operates separate **certification (sandbox)** and **production**
environments. Webhook destinations and signing secrets are provisioned per
environment by your rep — verify you are using the secret that matches the
environment sending the webhook.

## Register Your Endpoint (summary)

1. Provide your HTTPS endpoint URL to your Zero Hash rep.
2. Choose which payload types to receive.
3. Receive and store the HMAC shared secret (and/or RSA public key).
4. Verify every delivery before acting on it (see [verification.md](verification.md)).
