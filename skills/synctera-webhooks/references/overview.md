# Synctera Webhooks Overview

## What Are Synctera Webhooks?

Synctera is a Banking-as-a-Service (BaaS) platform. Webhooks let your application
receive real-time notifications when banking resources change — accounts, cards,
transactions, customers, disputes, and more — even when those changes aren't
initiated directly by your API calls (e.g. a card network authorization or a
posted transaction).

You register HTTPS endpoints with Synctera and subscribe to the event types you
care about. When a matching event occurs, Synctera POSTs a signed JSON payload to
your endpoint.

## Event Type Naming

Event names use the format:

```
<resource>.[<sub-resource>.]<action>
```

Two names are verified: `ACCOUNT.UPDATED` and the three-segment
`TRANSACTIONS.POSTED.CREATED` (note the plural `TRANSACTIONS` and the optional
`POSTED` sub-resource). Other names such as `CARD.CREATED` or
`CARD.DIGITALWALLETTOKEN.UPDATED` illustrate the format only.

**Wildcards** subscribe to every event under a resource, including events added in
the future. For example, `CUSTOMER.*` subscribes to all customer events.

## Common Event Types

> **Only `ACCOUNT.UPDATED` and `TRANSACTIONS.POSTED.CREATED` are verified.** The
> rest of this table illustrates the naming *format* and is **not** an
> authoritative catalog — the full event enum was not captured. Confirm the exact
> event names against Synctera's [Webhooks guide](https://docs.synctera.com/docs/webhooks-guide)
> or your own webhook configuration before subscribing or switching on them.

| Event | Verified? | Triggered When | Common Use Cases |
|-------|-----------|----------------|------------------|
| `ACCOUNT.UPDATED` | ✅ verified | An account changed | Sync balances/status, notify users |
| `TRANSACTIONS.POSTED.CREATED` | ✅ verified | A posted transaction was recorded | Reconcile ledger, update balances |
| `CARD.CREATED` | illustrative | A card was issued | Provision card in your UI, send welcome |
| `CARD.UPDATED` | illustrative | A card changed | Reflect activation/lock status |
| `CARD.DIGITALWALLETTOKEN.CREATED` | illustrative | A card was added to a digital wallet | Track wallet provisioning |
| `DISPUTE.CREATED` | illustrative | A dispute was opened | Kick off dispute workflow |
| `DISPUTE.UPDATED` | illustrative | A dispute changed | Update dispute status |
| `APPLICATION.CREATED` / `APPLICATION.UPDATED` | illustrative | A customer application changed | Onboarding/KYC progress |
| `STATEMENT.CREATED` | illustrative | A statement was generated | Notify users, store statement |
| `CUSTOMER.*` | illustrative | Any customer event (wildcard form) | Sync customer profile changes |

## Event Payload Structure

Payloads are JSON. The event type is carried in a `type` field, alongside
identifiers for the affected resource. Fields vary by event, but generally
include:

- `type` — the event type string (e.g. `TRANSACTIONS.POSTED.CREATED`)
- Resource identifiers (e.g. account, card, customer, or transaction IDs)
- A timestamp for when the event occurred

Always key your handler off `type` and verify the signature before parsing.

## Delivery, Retries, and Retention

- Respond with a **2xx (200) within 5 seconds**, or Synctera treats the delivery
  as failed and retries.
- Retries use **exponential backoff** for up to ~55 hours.
- Events are **retained for 60 days**.

## Full Event Reference

For the complete list of event types, see Synctera's
[Webhooks guide](https://docs.synctera.com/docs/webhooks-guide) and the
[List webhook events](https://docs.synctera.com/v1/reference/listevents-1) API
reference.
