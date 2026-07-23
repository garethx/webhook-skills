# Setting Up Retell AI Webhooks

## Prerequisites

- A Retell AI account
- Your application's webhook endpoint URL (HTTPS in production)
- A Retell **API key with the webhook badge** — this key doubles as the signing
  secret used to verify signatures

## Get Your Signing Secret (API Key)

Retell does **not** issue a separate webhook signing secret. Webhooks are signed
with your **Retell API key**, and only a key that shows the **webhook badge** in
the dashboard can be used to verify signatures.

1. Log in to the [Retell dashboard](https://dashboard.retellai.com/).
2. Go to **Settings → API Keys**.
3. Copy an API key that displays the **webhook** badge (create one if needed).
4. Store it as `RETELL_API_KEY` in your environment — never commit it.

## Register Your Endpoint

You can configure webhooks at two levels.

### Account-level (all agents)

1. In the dashboard, open the **Webhooks** tab.
2. Set your endpoint URL, e.g. `https://yourdomain.com/webhooks/retell`.
3. Save. Events for **any** agent in the account are delivered here.

### Agent-level (overrides account-level)

Set the `webhook_url` field when creating or updating an agent (dashboard or
API). Events for that agent go to the agent's URL and **the account-level URL is
not triggered for that agent**.

```bash
curl -X PATCH https://api.retellai.com/update-agent/{agent_id} \
  -H "Authorization: Bearer $RETELL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"webhook_url": "https://yourdomain.com/webhooks/retell"}'
```

You can also filter which events an agent sends with the `webhook_events` field.

## Optional: IP Allowlist

Retell delivers webhooks from a fixed egress IP. If you restrict inbound
traffic, allowlist:

```
100.20.5.228
```

## Test Your Webhook

Retell doesn't have a "send test event" button — trigger a real call:

1. Point your webhook at a local tunnel (see below).
2. Place a test call to your agent (dashboard test call or the API).
3. Watch `call_started` → `call_ended` → `call_analyzed` arrive in order.

## Local Testing with Hookdeck

Receive webhooks on your machine without deploying:

```bash
npx hookdeck-cli listen 3000 retell --path /webhooks/retell
```

No account required — the CLI creates a guest account, gives you a public URL to
paste into the dashboard/agent, and shows a web UI for inspecting requests.
