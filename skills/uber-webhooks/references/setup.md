# Setting Up Uber Eats Webhooks

## Prerequisites

- An Uber developer account with an app registered at
  [developer.uber.com](https://developer.uber.com/)
- The Uber Eats API enabled for your app (and the relevant scopes granted)
- Your application's public webhook endpoint URL

## Get Your Signing Secret

Uber Eats webhooks are signed with your app's **Client Secret** — there is no
separate per-webhook signing secret for Uber Eats.

1. Go to the [Uber Developer Dashboard](https://developer.uber.com/dashboard).
2. Open your app.
3. Under **Auth** (Credentials), copy the **Client Secret**.
4. Store it as `UBER_CLIENT_SECRET` in your environment — this is the HMAC key
   used to verify the `X-Uber-Signature` header.

> **Keep the Client Secret private.** Anyone with it can forge valid webhook
> signatures.

## Register Your Endpoint

1. In the Developer Dashboard, open your app and go to the **Webhooks** tab.
2. Set the **Primary Webhook URL** to your public endpoint
   (e.g. `https://your-app.com/webhooks/uber`). You configure **one** Primary
   Webhook URL per integration.
3. Choose an **authentication method** for outgoing webhooks if desired —
   **Basic Auth** or **OAuth** (this is an extra layer on top of the
   `X-Uber-Signature` HMAC; configure the credentials Uber should present when
   calling your endpoint).
4. Ensure the webhook scopes for the events you need (orders, store) are
   enabled for your app.

Uber Eats does not have a per-event subscription checklist like some providers —
your app receives the event types its scopes allow.

## Uber Direct (Deliveries)

If you use **Uber Direct** (the Deliveries API) rather than Uber Eats, webhooks
are configured differently:

- Create webhooks per app in the **Uber Direct Dashboard**.
- Each webhook has its own dedicated **Signing Key** (not the client secret).
- Signatures arrive as `x-uber-signature` and/or `x-postmates-signature`.

See [verification.md](verification.md) for the verification differences.

## Test Mode vs Live Mode

Uber provides sandbox/integration environments for building against the Eats
API. Use the [Hookdeck CLI](https://hookdeck.com/docs/cli) to receive webhooks
on your local machine while developing:

```bash
npx hookdeck-cli listen 3000 uber --path /webhooks/uber
```

This gives you a public URL to paste into the **Primary Webhook URL** field and
a web UI to inspect and replay deliveries.

## Verify Your Endpoint

After configuring the URL, trigger a test order (or provision a test store) in
the sandbox and confirm your endpoint:

1. Receives the POST.
2. Verifies the `X-Uber-Signature` against `UBER_CLIENT_SECRET`.
3. Responds with `200` and an empty body.
