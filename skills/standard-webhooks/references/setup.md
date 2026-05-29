# Setting Up a Standard Webhooks Endpoint

The Standard Webhooks specification covers the protocol — verification, headers, signing — but the dashboard for creating endpoints is provider-specific. This guide describes the steps that are common across every provider that adopts the spec.

## Prerequisites

- An account with a provider that emits Standard Webhooks (Clerk, Resend, Knock, OpenAI, etc.)
- A publicly reachable URL for your handler (or a local tunnel — see [Local Testing](#local-testing))

## Get Your Signing Secret

1. Open the provider's dashboard and locate the webhooks / endpoints section.
2. Create a new endpoint, pointing at the route your handler exposes (e.g. `https://your-app.com/webhooks/standard`).
3. Copy the **signing secret**. With Standard Webhooks the secret looks like:
   - `whsec_…` for symmetric (HMAC-SHA256) — the default
   - `whpk_…` for asymmetric (ed25519) — provider-opt-in

   The string after the prefix is base64-encoded. Don't strip the prefix yourself when storing it; the `standardwebhooks` library expects the full string.

4. Store the secret in your application's environment as `WEBHOOK_SECRET`.

## Select Events

Standard Webhooks providers typically let you pick which event types fire your endpoint. Choose only what you need — every event costs a round-trip and an idempotency check.

The spec does not define event names. Common patterns adopted by providers:

- Resource lifecycle: `<resource>.created` / `.updated` / `.deleted`
- Message/job: `<resource>.sent` / `.delivered` / `.failed`

Check the provider's docs for the canonical names.

## Test the Endpoint

Most Standard Webhooks providers offer a "Send test event" or "Replay" button in the dashboard. Use it to confirm:

1. Your endpoint returns **200 OK** on a valid event
2. Your endpoint returns **400** on tampered payload or invalid signature
3. Your logs show the event `type` and `data` parsed correctly

## Local Testing

Use the Hookdeck CLI to receive webhooks on `localhost`:

```bash
npx hookdeck-cli listen 3000 standard --path /webhooks/standard
```

This prints a public URL. Paste it into the provider's webhook endpoint configuration. The CLI also shows a request inspector at https://console.hookdeck.com.

For frameworks running on a different port:

```bash
# Next.js (default 3000, override if needed)
npx hookdeck-cli listen 3000 standard --path /webhooks/standard

# FastAPI (default 8000)
npx hookdeck-cli listen 8000 standard --path /webhooks/standard
```

## Rotating the Secret

Standard Webhooks supports key rotation natively: the `webhook-signature` header may contain **multiple** space-delimited signatures (e.g. `v1,<old> v1,<new>`). During a rotation, the provider signs with both old and new secrets so your handler can switch over without dropping events.

Rotation steps:

1. Generate a new secret in the provider's dashboard
2. Add the new secret to your environment alongside the old one (most providers handle the dual-signing for you transparently — you just update the env var)
3. After the cutover window ends, remove the old secret

The `standardwebhooks` library handles multi-signature verification out of the box; if you're using a custom handler, iterate through every signature in the header before rejecting.
