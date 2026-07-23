# Setting Up Zendesk Webhooks

## Prerequisites

- A Zendesk account with **admin** access to Admin Center
- Your application's public webhook endpoint URL (e.g. `https://example.com/webhooks/zendesk`)

## Create a Webhook

You can create a webhook two ways, matching the two delivery models.

### Option A — Event subscription (subscribe to `zen:event-type:*` events)

1. Go to **Admin Center → Apps and integrations → Webhooks → Actions → Create webhook**.
2. Choose **Zendesk events** as the source.
3. Select the event types to subscribe to (e.g. `Ticket Created`,
   `Ticket Comment Added`). These map to `zen:event-type:ticket.created`,
   `zen:event-type:ticket.comment_added`, etc.
4. Set the **Endpoint URL** to your handler, method `POST`, format **JSON**.
5. Choose an **authentication** option for the endpoint if desired (None, API key,
   Basic auth, or Bearer token). This is **separate from and additional to**
   signature verification — see below.
6. Create the webhook.

### Option B — Connected to a trigger or automation (custom payload)

1. Create a webhook with **Trigger or automation** as the source and set the
   **Endpoint URL**, method, and format.
2. Go to **Admin Center → Objects and rules → Business rules → Triggers**
   (or **Automations**) and create/edit a rule.
3. Add the action **Notify by → Active webhook**, pick your webhook, and author
   the **JSON body** using placeholders (e.g. `{"ticket_id": "{{ticket.id}}"}`).

> A webhook subscribed to events **cannot** also be connected to a trigger, and
> vice versa.

## Get Your Signing Secret

Zendesk signs webhook requests with a signing secret unique to each webhook.

**Via API:**

```bash
curl https://{subdomain}.zendesk.com/api/v2/webhooks/{webhook_id}/signing_secret \
  -u {email}/token:{api_token}
```

The response contains `signing_secret.secret`. To rotate it, `POST` to the same
endpoint to reset it.

**Via Admin Center:** open the webhook, find **Signing secret**, and click
**Reveal secret**.

Store the secret as `ZENDESK_WEBHOOK_SECRET` in your environment. **Never** hardcode it.

## Test Mode

Before a webhook is created, Zendesk lets you send a **test request** from the
builder. Test requests are signed with a **static secret** that is always:

```
dGhpc19zZWNyZXRfaXNfZm9yX3Rlc3Rpbmdfb25seQ==
```

Use this value to verify test deliveries, then switch to the webhook's real
signing secret once it's created.

## Endpoint Authentication vs. Signature Verification

Zendesk offers optional endpoint **authentication** (API key header, Basic auth,
or Bearer token) configured on the webhook. This is independent of the HMAC
**signature** headers that Zendesk always adds. Best practice: always verify the
`X-Zendesk-Webhook-Signature` signature regardless of any endpoint auth you configure.

## Delivery, Retries, and Circuit Breaker

- **Timeout:** Zendesk waits ~12 seconds for a response, with up to 5 retries.
- **`409 Conflict`:** retried up to 3 times.
- **`429` / `503`:** the `retry-after` header is honored when it is under 60 seconds.
- **Circuit breaker:** delivery is paused when the error rate hits 70%, or after
  1,000+ errors in a 5-minute window.

Return a `2xx` quickly (do heavy work asynchronously) to avoid timeouts and retries.
