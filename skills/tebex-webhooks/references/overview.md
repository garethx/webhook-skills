# Tebex Webhooks Overview

## What Are Tebex Webhooks?

Tebex is a monetization platform for game servers and communities. Webhooks
notify your backend in real time when a payment completes, a refund or dispute
occurs, or a recurring subscription changes state — so you can grant/revoke
in-game perks, update entitlements, or reconcile orders without polling the API.

Each endpoint is configured per store in the **Tebex Creator Panel** and can be
subscribed to a specific set of event types.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `validation.webhook` | You add or edit an endpoint | Echo the `id` back with a 200 to activate the endpoint |
| `payment.completed` | A checkout is paid in full | Grant perks, deliver goods, fulfill the order |
| `payment.declined` | A payment attempt is declined | Notify the buyer, log the failure |
| `payment.refunded` | A payment is refunded | Revoke perks, update accounting |
| `payment.dispute.opened` | A chargeback/dispute is filed | Flag the account, gather evidence |
| `payment.dispute.won` | A dispute resolves in your favor | Restore access, close the case |
| `payment.dispute.lost` | A dispute resolves against you | Revoke access, write off the order |
| `payment.dispute.closed` | A dispute is closed | Finalize case handling |
| `recurring-payment.started` | A subscription begins | Provision recurring access |
| `recurring-payment.renewed` | A subscription renews | Extend access, record the renewal |
| `recurring-payment.ended` | A subscription ends | Revoke recurring access |
| `recurring-payment.cancellation.requested` | A cancellation is requested | Schedule end-of-term revocation |
| `recurring-payment.cancellation.aborted` | A pending cancellation is aborted | Keep the subscription active |

## Event Payload Structure

Every webhook shares the same envelope:

```json
{
  "id": "7003c0b8-5a2e-4f7a-9d3e-4f21c8e1f0aa",
  "type": "payment.completed",
  "date": "2024-05-01T12:00:00.000Z",
  "subject": {
    "...": "event-specific data"
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique webhook delivery ID (echo this for `validation.webhook`) |
| `type` | The event type string (dispatch on this) |
| `date` | When the webhook was generated |
| `subject` | Event-specific data (transaction, subscription, dispute, etc.) |

## Full Event Reference

For the complete list of events and payload fields, see [Tebex's webhook documentation](https://docs.tebex.io/developers/webhooks/overview).
