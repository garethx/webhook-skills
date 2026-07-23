# Setting Up USPS Webhooks

USPS webhooks are configured entirely through the **Subscriptions - Tracking
API** — there is no dashboard toggle. You create subscriptions programmatically
using an OAuth2 access token.

## Prerequisites

- A [USPS Developer Portal](https://developers.usps.com/) account and a
  registered application with the **Subscriptions - Tracking** and **Tracking**
  APIs enabled.
- Your app's **Consumer Key** and **Consumer Secret** (OAuth2 client
  credentials).
- A publicly reachable HTTPS **listener URL** for your webhook endpoint.
- A **Mailer ID (MID)** or the specific **tracking numbers** you want to watch.

## Step 1: Get an OAuth2 Access Token

Subscription management uses the **client-credentials** grant. The token
endpoint is:

```
POST https://api.usps.com/oauth2/v3/token
```

```bash
curl -X POST https://api.usps.com/oauth2/v3/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "YOUR_CONSUMER_KEY",
    "client_secret": "YOUR_CONSUMER_SECRET"
  }'
```

The response contains an `access_token`. This token is used **only** to create
and manage subscriptions — it is **not** sent with delivered notifications.

## Step 2: Create a Subscription

```
POST https://api.usps.com/subscriptions/v3/subscriptions
```

```bash
curl -X POST https://api.usps.com/subscriptions/v3/subscriptions \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionType": "TRACKING",
    "listenerURL": "https://your-app.com/webhooks/usps",
    "eventType": "ALL_UPDATES",
    "filterProperties": {
      "mailerID": "123456789"
    },
    "secret": "your_32_character_subscription_secret"
  }'
```

Key fields:

| Field | Notes |
|-------|-------|
| `subscriptionType` | `TRACKING` |
| `listenerURL` | Your HTTPS webhook endpoint. Max **10 listener URLs** per Home CRID |
| `eventType` | Event filter. Currently only `ALL_UPDATES` is supported |
| `filterProperties` | Scope by `mailerID` (MID) or by specific `trackingNumber`(s) |
| `secret` | A **32-character** string used to compute the `X-HMAC` signature. **Optional but strongly recommended** |

## Step 3: Choose Your Verification Strategy

Delivered notifications carry **no** OAuth token. USPS offers two **optional**
per-message verification mechanisms — use at least one:

1. **HMAC signature (recommended).** Provide a 32-char `secret`. USPS sends
   `Base64(HMAC-SHA256(secret, timestamp + payload))` in the `X-HMAC` header.
   See [verification.md](verification.md).
2. **IP allowlisting.** Restrict inbound traffic to USPS's published source IP
   ranges at your firewall / load balancer.

> ⚠️ If you provide **neither** a `secret` **nor** an IP allowlist, there is
> **no** per-message verification at all — anyone who learns your listener URL
> can POST fake notifications. Always set a `secret`.

## Step 4: Store the Secret

Save the 32-char `secret` in your environment as `USPS_WEBHOOK_SECRET`. Your
handler needs it to verify every incoming notification.

```bash
USPS_WEBHOOK_SECRET=your_32_character_subscription_secret
```

## Managing Subscriptions

- **List / get / delete** subscriptions via the same Subscriptions API using
  your OAuth token.
- A subscription that USPS cannot reach is set to `SUSPENDED`; re-activate it
  once your endpoint is healthy.
- A subscription is **auto-deleted after 30 days of inactivity** (warning at 25
  days). Keep it active or recreate as needed.

## Testing Locally

Use the Hookdeck CLI to receive notifications on your machine without deploying:

```bash
npx hookdeck-cli listen 3000 usps --path /webhooks/usps
```

Use the printed HTTPS URL as the `listenerURL` when you create the subscription.
No account is required — the CLI creates a guest account and gives you a local
tunnel plus a web UI for inspecting requests.

## Full Reference

See the [USPS Subscriptions - Tracking API documentation](https://developers.usps.com/subscriptions-trackingv3r2)
for the complete subscription schema and management endpoints.
