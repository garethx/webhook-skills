# Setting Up Persona Webhooks

## Prerequisites

- A Persona account with access to the Dashboard
- Your application's public webhook endpoint URL (e.g. `https://api.example.com/webhooks/persona`)

## Create a Webhook

1. Go to the Persona **Dashboard**.
2. Open **Webhooks** (under Integrations / Developer settings).
3. Click **Create webhook** (or **Add endpoint**).
4. Enter your endpoint **URL**.
5. Choose the **environment** — Sandbox or Production. Only enabled events in the
   selected environment are delivered.
6. Select the **API version** for this webhook. This fixes the schema of
   `data.attributes.payload.data`. Pin it deliberately and test before changing.
7. **Subscribe to events.** Subscription is **per event type** at webhook creation.
   Select the specific events you need (e.g. `inquiry.completed`, `inquiry.approved`,
   `verification.passed`). Report events use the slash form, e.g.
   `report/watchlist.ready`.
8. Save.

## Get Your Signing Secret

1. In the **Dashboard → Webhooks**, select your webhook.
2. **Reveal** the webhook secret. It is a **per-webhook** value prefixed with
   `wbhsec_`.
3. Store it as `PERSONA_WEBHOOK_SECRET` in your environment. Never commit it.

Every webhook has its own secret — if you run multiple endpoints, each has a
distinct `wbhsec_...` value.

## Rotating the Secret

When you rotate a webhook secret, Persona signs each request with **both** the old
and new secret for a transition window. The `Persona-Signature` header then carries
**two space-separated `t=...,v1=...` pairs**. A correct verifier accepts the request
if **either** `v1` matches the secret it currently holds — so verification keeps
working while you roll the new secret out. See
[verification.md](verification.md) for the parsing details.

## IP Allowlisting (Optional)

Persona publishes fixed egress IP ranges (check the dashboard/docs for current ranges and regions) and
supports **IP allowlisting**. If your infrastructure restricts inbound traffic, allow
Persona's documented IP ranges so deliveries are not blocked. Check the current
ranges in Persona's webhook documentation, as they can change.

## Sandbox vs Production

- Persona has separate **Sandbox** and **Production** environments, each with its
  own webhooks and secrets.
- Build and test against **Sandbox** first — create test inquiries to trigger real
  events.
- Recreate the webhook (or add a Production one) with a Production secret when you
  go live.

## Test Your Endpoint

- Create a test inquiry in Sandbox to fire real events end to end.
- Or **redeliver** a past event: **Webhooks → Recent events → Resend** (events are
  retained for 30 days).
- For local development, tunnel with the Hookdeck CLI:
  ```bash
  npx hookdeck-cli listen 3000 persona --path /webhooks/persona
  ```
