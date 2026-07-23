# Setting Up RingCentral Webhooks

## Prerequisites

- A RingCentral developer account and an app with a valid OAuth token
- Your application's webhook endpoint URL — **must be HTTPS**
- The endpoint must respond to the Validation-Token handshake before it can
  receive notifications

## How Subscriptions Work

RingCentral webhooks are configured via the REST API (there is no dashboard form
for creating them). You create a **subscription** that specifies:

- `eventFilters` — the resource paths (event filters) you want to be notified about
- `deliveryMode.transportType` — `"WebHook"`
- `deliveryMode.address` — your HTTPS endpoint
- `deliveryMode.verificationToken` — optional shared secret echoed as the
  `Verification-Token` header on every notification
- `expiresIn` — subscription lifetime in seconds

## Create a Subscription

```http
POST https://platform.ringcentral.com/restapi/v1.0/subscription
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "eventFilters": [
    "/restapi/v1.0/account/~/extension/~/message-store",
    "/restapi/v1.0/account/~/extension/~/presence?detailedTelephonyState=true"
  ],
  "deliveryMode": {
    "transportType": "WebHook",
    "address": "https://your-app.com/webhooks/ringcentral",
    "verificationToken": "your_verification_token"
  },
  "expiresIn": 630720000
}
```

`expiresIn` now allows very long lifetimes (up to ~20 years / ~630,720,000
seconds); the old ~7-day cap was raised. You can still use shorter TTLs and renew.

### Using the official SDK

The RingCentral SDKs create subscriptions (they do not verify incoming webhooks —
there is no signature to verify). Use the pinned versions:

**Node.js — `@ringcentral/sdk` (^5.0.11):**

```javascript
const { SDK } = require('@ringcentral/sdk');

const rcsdk = new SDK({ server: SDK.server.production, clientId, clientSecret });
const platform = rcsdk.platform();
await platform.login({ jwt: process.env.RC_JWT });

await platform.post('/restapi/v1.0/subscription', {
  eventFilters: ['/restapi/v1.0/account/~/extension/~/message-store'],
  deliveryMode: {
    transportType: 'WebHook',
    address: 'https://your-app.com/webhooks/ringcentral',
    verificationToken: process.env.RINGCENTRAL_VERIFICATION_TOKEN,
  },
  expiresIn: 630720000,
});
```

**Python — `ringcentral` (>=0.9.2):**

```python
from ringcentral import SDK

rcsdk = SDK(client_id, client_secret, server_url)
platform = rcsdk.platform()
platform.login(jwt=RC_JWT)

platform.post('/restapi/v1.0/subscription', {
    'eventFilters': ['/restapi/v1.0/account/~/extension/~/message-store'],
    'deliveryMode': {
        'transportType': 'WebHook',
        'address': 'https://your-app.com/webhooks/ringcentral',
        'verificationToken': RINGCENTRAL_VERIFICATION_TOKEN,
    },
    'expiresIn': 630720000,
})
```

## The Validation-Token Handshake

When you create (or renew) a subscription, RingCentral immediately sends a
request to your `address` carrying a `Validation-Token` request header. Your
endpoint must:

1. Read the `Validation-Token` request header
2. Echo the exact value back in a `Validation-Token` **response** header
3. Return HTTP `200`
4. Respond **quickly** (a few seconds) with a small response and
   `Content-Type: application/json`

If the endpoint fails this validation/health check, the subscription is not
activated.

## Renewing Subscriptions

Renew before expiry to keep receiving events:

```http
POST https://platform.ringcentral.com/restapi/v1.0/subscription/{subscriptionId}/renew
Authorization: Bearer <ACCESS_TOKEN>
```

A `PUT /restapi/v1.0/subscription/{subscriptionId}` also renews and updates the
subscription. Each renewal re-triggers the Validation-Token handshake.

## Blacklisting (Important Gotcha)

If your endpoint repeatedly fails validation or health checks within the first
~10 minutes, RingCentral **blacklists** the address and stops delivering. Once the
endpoint is healthy again, RingCentral auto-reconciles roughly every ~15 minutes.
To avoid blacklisting:

- Always complete the handshake with `200` and the echoed header
- Respond fast — acknowledge with `200` first, then do work asynchronously
- Keep responses small with `Content-Type: application/json`
- Serve HTTPS with TLS 1.2+

## Test Mode

Use the RingCentral **sandbox** (`https://platform.devtest.ringcentral.com`) with a
tunnel (e.g. Hookdeck CLI) pointed at your local server while developing. Sending a
test SMS or changing presence in the sandbox triggers real notifications.
