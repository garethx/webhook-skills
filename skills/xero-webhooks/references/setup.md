# Setting Up Xero Webhooks

## Prerequisites

- A Xero account with access to the [developer portal](https://developer.xero.com/app/manage)
- A registered Xero app (OAuth2). Webhooks are configured **per app**.
- A publicly reachable HTTPS endpoint (use the [Hookdeck CLI](#local-testing) or ngrok for local development)

## Get Your Webhook Signing Key

1. Go to [developer.xero.com/app/manage](https://developer.xero.com/app/manage) and open your app.
2. Select the **Webhooks** tab.
3. Choose the event categories your app should receive (**Contacts**, **Invoices**, etc.).
4. Enter your **Delivery URL** (your endpoint, e.g. `https://your-domain.com/webhooks/xero`).
5. Xero displays a **Webhook signing key** — copy it. This is the single HMAC key for this app; store it as `XERO_WEBHOOK_KEY`.

> One signing key per app. If you rotate it in the portal, update `XERO_WEBHOOK_KEY` in your environment.

## Register Your Endpoint & Pass Intent to Receive (ITR)

When you save the webhook configuration, Xero immediately runs an **Intent to Receive (ITR)** check against your Delivery URL before it will activate the webhook:

1. Xero POSTs one or more **validation payloads** to your endpoint (these look like normal webhook bodies but carry no meaningful events).
2. Your endpoint must, within a few seconds:
   - Return **HTTP 200** when the `x-xero-signature` matches your computed HMAC.
   - Return **HTTP 401** when the signature does **not** match.
3. To prove your verification actually works, Xero sends **both** a correctly-signed payload (expects `200`) and an intentionally **wrong**-signed payload (expects `401`). Your endpoint must return `401` for the bad one — returning `200` for everything fails ITR.

If ITR passes, the webhook status becomes **OK/active**. If it fails, the webhook stays **inactive** and no events are delivered — click **Send "Intent to receive"** again after fixing your endpoint.

### ITR checklist

- [ ] Endpoint is publicly reachable over HTTPS
- [ ] Returns `200` for a valid signature
- [ ] Returns `401` (not `400`, not `500`) for an invalid signature
- [ ] Responds within a few seconds (do heavy work asynchronously)
- [ ] Reads the **raw** request body for HMAC (no JSON body parser mutating the bytes first)

## Local Testing

Use the Hookdeck CLI to forward Xero deliveries to your local server — no account required:

```bash
npx hookdeck-cli listen 3000 xero --path /webhooks/xero
```

The CLI prints a public URL. Put that URL (with the `/webhooks/xero` path) in the app's **Delivery URL** field, then trigger ITR from the portal. For real events, make a change in a connected organisation (e.g. create a contact).

## Selecting Events

In the **Webhooks** tab you enable whole **categories** (Contacts, Invoices, …). Xero then sends every `CREATE`/`UPDATE` within those categories. Filter to the specific `eventCategory`/`eventType` combinations you care about inside your handler.

## Recommended Events to Start With

| Category | Why |
|----------|-----|
| `CONTACT` | Keep customer/supplier records in sync |
| `INVOICE` | React to new invoices and payment status changes |
| `CREDITNOTE` | Track refunds and adjustments |

## Troubleshooting Setup

- **Webhook stuck "inactive" / ITR fails:** Your endpoint isn't returning `200` for valid and `401` for invalid signatures within the time limit. See [verification.md](verification.md).
- **Signature never matches:** You're almost certainly hashing a re-serialized body. Capture the **raw** bytes before any JSON parsing.
- **Works locally but not in production:** Confirm the production `XERO_WEBHOOK_KEY` matches the key shown in the portal for that app, and that a proxy/load balancer isn't altering the body.
