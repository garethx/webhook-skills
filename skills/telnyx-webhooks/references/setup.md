# Setting Up Telnyx Webhooks

## Prerequisites

- A Telnyx account with access to [Mission Control](https://portal.telnyx.com/)
- A messaging profile (Messaging → Messaging Profiles) or a connection/app for the product
  you're integrating
- Your application's public webhook endpoint URL

## Get Your Public Key (for signature verification)

Telnyx signs webhooks with an Ed25519 key and gives you the **public** key to verify them.
The key is **per-account** (the same key verifies webhooks from every messaging profile and
product on the account — it is *not* per-profile).

1. Go to Mission Control → **Account Settings** → **Keys & Credentials**.
2. Open the **Public Key** section.
3. Copy the **base64** public key (32 bytes, e.g. `eu2zvPjhY6odxV34Z/EsRiERvTodkev4Fq0SlK90Izg=`).
4. Store it as `TELNYX_PUBLIC_KEY` in your environment (see each example's `.env.example`).

> There is no per-webhook "signing secret" to copy — verification uses this account public
> key plus the Ed25519 signature Telnyx sends in the request headers.

## Register Your Webhook Endpoint

For **messaging**:

1. Go to Messaging → **Messaging Profiles** → select your profile.
2. Under **Outbound** and **Inbound**, set the **Webhook URL** to your endpoint
   (e.g. `https://your-app.com/webhooks/telnyx`).
3. Set the **Webhook Failover URL** (optional but recommended) to a backup endpoint.
4. Set the **Webhook API Version** to **v2** — this enables signed (Ed25519) webhooks.
   (v1 is the legacy, *unsigned* format; avoid it for new integrations.)
5. Save.

For **Call Control / voice** and other products, the webhook URL, failover URL, and API
version are configured on the corresponding **connection** or **application** instead of the
messaging profile — but the public key and signing scheme are the same.

## Choose Events

Messaging profiles emit `message.received`, `message.sent`, and `message.finalized`
automatically once a webhook URL is configured — there is no per-event checkbox for basic
messaging. For other products (e.g. Call Control), subscribe to the specific events you need
on that connection/application.

## Test Mode vs Live Mode

Telnyx does not have a separate "test mode" for webhooks. To test end to end:

1. Point your webhook URL at a tunnel during development (see below).
2. Send a real message via the Messaging API, or text one of your Telnyx numbers, and watch
   the `message.sent` / `message.finalized` / `message.received` events arrive.

## Local Development with Hookdeck

Expose your local server with the Hookdeck CLI (no account required):

```bash
# Express / Next.js (port 3000)
npx hookdeck-cli listen 3000 telnyx --path /webhooks/telnyx

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 telnyx --path /webhooks/telnyx
```

The CLI prints a public URL — paste it into the messaging profile's Webhook URL (with
Webhook API Version **v2**), then trigger a message to see signed events flow to your handler.

## Verify It Works

- Send a test message; confirm your handler logs `message.sent` then `message.finalized`.
- Text your Telnyx number; confirm you receive `message.received`.
- Confirm signature verification passes (no `Invalid signature` responses). If it fails, see
  [verification.md](verification.md).
