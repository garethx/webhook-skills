# Bridge API Webhooks Overview

## What Are Bridge API Webhooks?

[Bridge API](https://bridgeapi.io) (`bridgeapi.io`) is the open-banking /
account-aggregation and payment-initiation platform by Bridge (formerly
Bankin'). Webhooks let Bridge notify your backend when something happens
asynchronously — a bank connection ("item") finishes refreshing, an account
balance changes, a payment transaction updates, or a user is deleted — so you
don't have to poll the API.

> **Not bridge.xyz.** This is unrelated to [bridge.xyz](https://bridge.xyz),
> the stablecoin payments company. See the
> [bridge-xyz-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/bridge-xyz-webhooks)
> skill for that provider.

Each webhook is created in the Bridge dashboard with a callback URL, an optional
name, and a set of subscribed events. You can create up to **10 webhooks per
application**. Each webhook has its own auto-generated signing secret used to
verify deliveries.

## Common Event Types

The event name is carried in the `type` field of the JSON body — there is **no**
event header. Names are lowercase `resource.action` strings (the dashboard test
event is the exception).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `item.created` | A bank connection (item) is created | Track onboarding progress |
| `item.refreshed` | An item's data finished refreshing | Pull fresh accounts/transactions |
| `item.account.created` | A new account is discovered under an item | Store the account, start reconciliation |
| `item.account.updated` | An account's balance or details changed | Update cached balances |
| `item.account.deleted` | An account is removed from an item | Clean up local records |
| `payment.transaction.created` | A payment transaction is created | Record a pending payment |
| `payment.transaction.updated` | A payment transaction's status changed | Reconcile payment status |
| `payment.link.updated` | A payment link's status changed | Update checkout/payment-link state |
| `user.deleted` | A user is deleted | GDPR cleanup, revoke access |
| `TEST_EVENT` | The dashboard "Send a test" button was clicked | Verify your endpoint is reachable |

## Event Payload Structure

All events share the same envelope:

```json
{
  "type": "item.refreshed",
  "timestamp": 1699999999,
  "content": {
    "item_id": 12345,
    "user_uuid": "a1b2c3d4-...",
    "status": 0
  }
}
```

- `type` — the event name (dispatch on this).
- `timestamp` — Unix timestamp of the event.
- `content` — event-specific fields (e.g. `item_id`, `account_id`, `user_uuid`,
  `status`). The exact fields vary by event type.

The test event looks like:

```json
{
  "type": "TEST_EVENT",
  "timestamp": 1699999999,
  "content": { "item_id": 0, "status": 0, "user_uuid": "..." }
}
```

## Delivery Behaviour

- **Retries:** Non-200 responses (or responses that are too slow) are retried
  for **1–2 days** with an exponential back-off.
- **Respond fast, respond small:** Return `200` quickly and keep the response
  body under **10 KB**. Do heavy work asynchronously after acknowledging.
- **Expect ghosts:** You may receive webhooks for **already-deleted users or
  items**. Handle missing records defensively — a lookup miss is expected, not
  an error.
- **Source IPs:** Deliveries originate from fixed IPs `63.32.31.5`,
  `52.215.247.62`, `34.249.92.209` (read `X-Forwarded-For` behind a proxy).

## Full Event Reference

For the complete, authoritative list of events, see
[Bridge API's webhook documentation](https://docs.bridgeapi.io/docs/webhooks).
