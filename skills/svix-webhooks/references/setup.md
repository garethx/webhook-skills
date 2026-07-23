# Setting Up Svix Webhooks

Because Svix is used by many upstream services, the exact dashboard varies by
sender. Most senders expose a **Svix App Portal** — a hosted UI where you add
endpoints and copy the signing secret. The steps below apply to that portal and
to Svix directly.

## Prerequisites

- An account with the sender that delivers webhooks via Svix
- A publicly reachable endpoint URL (or a tunnel — see [Local Development](#local-development))

## Register Your Endpoint

1. Open your sender's webhook / Svix App Portal (often "Settings → Webhooks").
2. Click **Add Endpoint**.
3. Set the URL to your handler, e.g. `https://your-app.com/webhooks/svix`.
4. Subscribe to the event types you care about (or all events).
5. Save the endpoint.

## Get Your Signing Secret

1. Open the endpoint you just created.
2. Copy the **Signing Secret** — it starts with `whsec_` (e.g. `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`).
3. Store it as an environment variable:

   ```bash
   SVIX_WEBHOOK_SECRET=whsec_xxxxx
   ```

Each endpoint has its own secret. If you receive from multiple senders/endpoints,
store one secret per endpoint.

## Secret Rotation

Svix supports rotating an endpoint's signing secret. During the rollover window,
Svix signs each message with **both** the old and new secrets, sending multiple
space-delimited `v1,<sig>` entries in `svix-signature`. Your verifier must accept
a message if **any** signature matches — the official SDK does this automatically.

## Standard Webhooks Header Names

Svix sends `svix-id`, `svix-timestamp`, and `svix-signature`. Some senders on the
Standard Webhooks Professional/Enterprise tier instead send the interchangeable
`webhook-id`, `webhook-timestamp`, and `webhook-signature` names. The format is
identical; the `svix` SDK accepts both. If you verify manually, accept both sets.

## Local Development

Use the Hookdeck CLI to receive webhooks on your machine without deploying:

```bash
npx hookdeck-cli listen 3000 svix --path /webhooks/svix
```

This prints a public URL — use it as the endpoint URL in the sender's portal.
No account is required; the CLI creates a guest account and a web UI for
inspecting requests.

## Testing

Most Svix App Portals include a **Send Example / Testing** tab that dispatches a
sample event to your endpoint so you can confirm your signature verification and
event handling end to end.
