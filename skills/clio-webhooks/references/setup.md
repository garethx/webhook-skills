# Setting Up Clio Webhooks

## Prerequisites

- A Clio developer application with OAuth 2.0 credentials.
- An OAuth access token with the `webhook` scope **plus** the scope of each model
  you subscribe to (e.g. `matters`, `contacts`).
- A publicly reachable **HTTPS** endpoint. Clio rejects any non-`https` URL.

Clio has **no dashboard UI** for webhooks and **no official server SDK** — you
create and manage webhooks over the REST API.

## Regional Base URLs

Use the base URL for the account's region:

| Region | Base URL |
|--------|----------|
| US | `https://app.clio.com` |
| EU | `https://eu.app.clio.com` |
| Australia | `https://au.app.clio.com` |
| Canada | `https://ca.app.clio.com` |

Examples below use `app.clio.com`.

## Step 1: Create the Webhook

`POST /api/v4/webhooks.json` with a `data` object. Required fields: `url`,
`model`, `fields`. Optional: `events`, `expires_at`.

```bash
curl -X POST https://app.clio.com/api/v4/webhooks.json \
  -H "Authorization: Bearer $CLIO_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "url": "https://your.app/webhooks/clio",
      "model": "matter",
      "fields": "id,etag",
      "events": ["created", "updated", "deleted"],
      "expires_at": "2026-08-20T00:00:00Z"
    }
  }'
```

- `model` accepts the string identifier (`"matter"`) or its numeric ID (`1`).
- `fields` selects which record fields appear in the payload (and, for `updated`,
  which fields are "watched"). Max 1000 characters.
- If `expires_at` is omitted, the webhook expires **3 days** after creation.

## Step 2: Complete the Handshake (Activation)

Immediately after creation (and whenever the `url` changes), Clio POSTs your
endpoint with an `X-Hook-Secret` header containing a generated **shared secret**.
**The webhook stays disabled until you confirm this handshake.** There are two
ways to confirm:

### Option 1 — Immediate (recommended)

Respond to the handshake POST with `200 OK` and echo the same value back in an
`X-Hook-Secret` response header. This is what the example handlers in this skill
implement.

```
200 OK
X-Hook-Secret: <the secret Clio just sent>
```

### Option 2 — Delayed

Store the secret, then `PUT /api/v4/webhooks/:webhook_id/activate` with the
secret in an `X-Hook-Secret` header.

```bash
curl -X PUT https://app.clio.com/api/v4/webhooks/1234/activate \
  -H "Authorization: Bearer $CLIO_ACCESS_TOKEN" \
  -H "X-Hook-Secret: <the secret Clio just sent>"
```

**Save the secret.** It is the key you will use to verify every later
`X-Hook-Signature`. Store it as `CLIO_WEBHOOK_SECRET` (ideally keyed by
`webhook_id` if you run multiple subscriptions).

## Step 3: Verify Event Signatures

Every event delivery includes an `X-Hook-Signature` header — the HMAC-SHA256
digest of the raw body, keyed with the shared secret. Clio's docs do not say
whether that digest is hex- or base64-encoded, so accept both. See
[verification.md](verification.md).

## Step 4: Renew Before Expiry

Clio does **not** track usage, so an expired webhook silently stops delivering.
The maximum lifetime is 31 days. Renew by updating `expires_at`:

```bash
curl -X PATCH https://app.clio.com/api/v4/webhooks/1234.json \
  -H "Authorization: Bearer $CLIO_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data": {"expires_at": "2026-09-15T00:00:00Z"}}'
```

Schedule renewals (e.g. a daily job that extends webhooks nearing expiry).

## Managing Webhooks

```bash
# List webhooks
curl https://app.clio.com/api/v4/webhooks.json \
  -H "Authorization: Bearer $CLIO_ACCESS_TOKEN"

# Delete a webhook
curl -X DELETE https://app.clio.com/api/v4/webhooks/1234.json \
  -H "Authorization: Bearer $CLIO_ACCESS_TOKEN"
```

## Local Testing

Use the Hookdeck CLI to forward Clio webhooks to your local server (no account
required — it creates a guest account on first run):

```bash
npx hookdeck-cli listen 3000 clio --path /webhooks/clio
```

Point your webhook's `url` at the Hookdeck URL the CLI prints, then create the
webhook. Hookdeck will forward both the handshake and event deliveries to your
local handler and let you inspect and replay them.
