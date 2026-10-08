# Setting Up Volume Webhooks

## Prerequisites

- A Volume merchant account with access to the merchant dashboard (sandbox and/or live)
- A public HTTPS endpoint that accepts **`PUT`** requests, e.g. `https://example.com/webhooks/volume`

## How Do I Register My Volume Webhook URL?

Volume has one webhook URL per application, set in the **application
configuration** in the Volume merchant dashboard. There are no per-event
subscriptions: every final payment status (`COMPLETED`, `SETTLED`, `FAILED`) is
sent to that URL.

1. Sign in to the Volume merchant dashboard for the environment you're setting up (sandbox or live).
2. Open your application's configuration.
3. Set the webhook URL to your endpoint, e.g. `https://example.com/webhooks/volume`.
4. Save. Sandbox and live are configured separately.

## Which Public Key Do I Use?

There's no signing secret to copy. Volume signs webhooks with its RSA private key
and publishes the matching public key for each environment:

| Environment | Public key URL | `VOLUME_ENV` |
|---|---|---|
| Sandbox | `https://api.sandbox.volumepay.io/.well-known/signature/pem` | `sandbox` |
| Live | `https://api.volumepay.io/.well-known/signature/pem` | `live` |

Each URL returns the base64 body of an SPKI public key **without** the
`-----BEGIN PUBLIC KEY-----` / `-----END PUBLIC KEY-----` lines.

The keys differ. A sandbox webhook will not verify against the live key, and
the reverse is also true. Point each deployment at the key for the environment
it receives webhooks from.

The examples read:

```bash
VOLUME_ENV=sandbox            # "sandbox" or "live"
# VOLUME_PEM_URL=https://...  # optional: override the key URL
# VOLUME_PUBLIC_KEY=MIIB...   # optional: literal key, skips the fetch
```

They cache the fetched key for an hour. If the key can't be fetched, they
reject the webhook with `503`, so verification fails closed and Volume
retries later.

## Optional: IP Allowlist

Volume's docs publish the static IPs that webhooks come from:

| Environment | IPs |
|---|---|
| Sandbox | `52.30.246.188` |
| Live | `52.56.123.234`, `18.175.86.214`, `3.11.7.150` |

You can allowlist these at your firewall or load balancer as defence in depth.
This **supplements** signature verification and never replaces it. If you put
Hookdeck or another proxy in front of your app, the source IP your app sees
will be the proxy's, so filter at the edge or rely on signatures.

## Testing in Sandbox

Volume's webhook docs publish two ready-made, sandbox-signed `curl` calls, one
`COMPLETED` and one `FAILED`. With `VOLUME_ENV=sandbox`, send one to your local
tunnel:

```bash
npx hookdeck-cli listen 3000 volume --path /webhooks/volume
# then run the docs' "curl --request PUT 'ENDPOINT_URL' ..." against the printed URL
```

Copy the body byte-for-byte. Any whitespace change invalidates the signature.

You can also complete a sandbox payment to trigger a real webhook.

For production, set your real endpoint URL in the **live** application
configuration and run the app with `VOLUME_ENV=live`.
