# Setting Up Token.io Webhooks

## Prerequisites

- A Token.io TPP member (Sandbox or Production) with Dashboard access
- Your application's public HTTPS webhook endpoint URL
- Your member's Ed25519 **public key** (used to verify deliveries)

## Get Your Ed25519 Public Key

Token.io signs webhooks with the private half of your member's Ed25519 key pair
and gives you the public half to verify with. There is **no shared secret**.

1. Log in to the [Token Dashboard](https://token.io).
2. Go to **Settings → Member Information**.
3. Copy your **Ed25519 public key**. It is **base64url-encoded with no padding**.
4. Store it as the `TOKEN_WEBHOOK_PUBLIC_KEY` environment variable in your app.

> Keep the public key in config, not hard-coded — it lets you rotate keys and run
> different keys per environment (Sandbox vs Production).

## Register Your Endpoint (Webhook Config)

Token.io uses a single webhook **config** per member (one URL, one list of event
types). Manage it through the API with your member's authenticated client.

**Subscribe / update** — `PUT /webhook/config`:

```json
{
  "config": {
    "type": ["PAYMENT_STATUS_CHANGED", "REFUND_STATUS_CHANGED"],
    "url": "https://your-app.com/webhooks/tokenio"
  }
}
```

- `type` — array of event types you want (see [overview.md](overview.md) for the full list).
- `url` — your public HTTPS endpoint. It must return **200** to acknowledge deliveries.

**Read the current config** — `GET /webhook/config`.

**Remove the config** — `DELETE /webhook/config` (returns an empty `200`).

> There is **one config per member/account** — a second `PUT` replaces the
> previous URL and type list rather than adding another subscription.

## Using the token-io SDK to Subscribe

The official [`token-io`](https://www.npmjs.com/package/token-io) npm package is a
broad API client. Use it to create the member client that calls
`PUT/GET/DELETE /webhook/config`. It does **not** verify webhook signatures — do
that manually with a crypto library (see [verification.md](verification.md)).

There is no official Python (pip) SDK; call the `/webhook/config` REST endpoints
directly with an authenticated request if you manage subscriptions from Python.

## Test Mode vs Live Mode

Token.io provides separate **Sandbox** and **Production** environments, each with
its own member and its own Ed25519 key pair. When you promote from Sandbox to
Production, update `TOKEN_WEBHOOK_PUBLIC_KEY` to the Production member's public
key and re-register the webhook config against the Production API host.

## Local Development

Use the Hookdeck CLI to receive live deliveries on your machine — no account required:

```bash
npx hookdeck-cli listen 3000 tokenio --path /webhooks/tokenio
```

Register the printed public URL as the `url` in your `PUT /webhook/config` request.
