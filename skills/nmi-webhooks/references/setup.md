# Setting Up NMI Webhooks

## Prerequisites

- An NMI (Network Merchants) gateway account with access to the **Merchant
  Control Panel** (this also applies to NMI-powered white-label gateways)
- Your application's public webhook endpoint URL (HTTPS)

## 1. Open the Webhooks Settings

1. Sign in to the **Merchant Control Panel**.
2. Go to **Settings → Webhooks**.

## 2. Get Your Signing Key

1. On the **Webhooks** page, locate the **signing key** (labeled as your
   *webhooks signing key*). Generate one if it does not exist yet.
2. Copy the signing key and store it as `NMI_SIGNING_KEY` in your app's
   environment.

> The signing key is what signs the `Webhook-Signature` header. It is **not** the
> same as your gateway API/security key used for processing transactions. If you
> regenerate the signing key, update `NMI_SIGNING_KEY` or every delivery will
> fail verification.

## 3. Register Your Endpoint

1. On the same **Settings → Webhooks** page, add your endpoint URL (e.g.
   `https://your-app.example.com/webhooks/nmi`).
2. Select the events you want to receive. For transaction handling, the common
   choices are the `transaction.<action>.<result>` events — for example
   `transaction.sale.success`, `transaction.auth.success`,
   `transaction.capture.success`, `transaction.void.success`,
   `transaction.refund.success`.
3. Save. NMI will begin POSTing events to your endpoint.

## 4. Verify Deliveries

Every POST includes a `Webhook-Signature: t=<nonce>,s=<signature>` header. Your
handler must:

1. Read the **raw body** (do not let a JSON parser touch it first).
2. Parse `t` (the nonce) and `s` (the signature) from the header.
3. Compute `HMAC-SHA256(signing_key, t + "." + raw_body)`, hex-encode it, and
   compare (timing-safe) to `s`.
4. Return **200** quickly. NMI retries deliveries that don't get a 2xx.

Remember: **`t` is a nonce, not a timestamp** — there is no age/replay window to
enforce. See [verification.md](verification.md) for the exact algorithm and
gotchas.

## Test Mode vs Live Mode

NMI does not have a separate webhook "test mode" toggle. To exercise your handler:

1. Start a tunnel:
   `npx hookdeck-cli listen 3000 nmi --path /webhooks/nmi`
2. Register the printed tunnel URL as your endpoint under **Settings → Webhooks**.
3. Run a small test transaction (a test/sandbox gateway or a low-value sale you
   then void) and watch the delivery arrive.

## Optional: IP Allowlisting

NMI delivers from published ranges (`104.192.32.81–104.192.32.87` and
`104.192.36.81–104.192.36.87`). Allowlisting these can be a defence-in-depth
layer, but the `Webhook-Signature` HMAC is the authoritative authenticity check —
never rely on IP alone.
