# Paystack Webhooks Overview

## What Are Paystack Webhooks?

Paystack is an African payments platform (Nigeria, Ghana, South Africa, Kenya,
and more). Webhooks let Paystack notify your application when events happen in
the payment flow — charges, transfers, refunds, subscriptions, invoices,
disputes — instead of your app having to poll the API.

When a subscribed event occurs, Paystack sends an **HTTP POST** request with a
JSON payload to the endpoint URL you configure in the dashboard. Every request
carries an `x-paystack-signature` header so you can verify it genuinely came from
Paystack (see [verification.md](verification.md)).

A single endpoint receives **all** events for that mode. You determine which
event occurred by reading the top-level `event` field in the JSON body — not a
header.

> **Important:** The webhook is the source of truth for payment status. For
> `charge.success` in particular, Paystack recommends re-verifying the
> transaction via the Verify Transaction API (`GET /transaction/verify/:reference`)
> before giving value, since webhooks can be received before you've finished your
> own processing.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `charge.success` | A payment (charge) is successful | Fulfil order, grant access, send receipt |
| `transfer.success` | A transfer to a recipient succeeds | Mark payout complete, notify recipient |
| `transfer.failed` | A transfer fails | Alert ops, retry payout, refund balance |
| `transfer.reversed` | A transfer is reversed | Reconcile ledger, re-credit balance |
| `refund.processed` | A refund has been completed | Update ledger, notify customer |
| `refund.failed` | A refund attempt fails | Alert ops, retry refund |
| `subscription.create` | A subscription is created | Provision the plan, start billing cycle |
| `subscription.disable` | A subscription is disabled/cancelled | Revoke access, offboard |
| `invoice.create` | An invoice is created ahead of a subscription charge | Notify customer of upcoming charge |
| `invoice.update` | An invoice is updated after a charge attempt | Reconcile the charge result |
| `invoice.payment_failed` | A subscription invoice payment fails | Dunning, retry, notify customer |
| `charge.dispute.create` | A dispute (chargeback) is opened | Gather evidence, respond to dispute |

Additional events include `charge.dispute.remind`, `charge.dispute.resolve`,
`customeridentification.success`, `customeridentification.failed`,
`dedicatedaccount.assign.success`, `dedicatedaccount.assign.failed`,
`paymentrequest.pending`, `paymentrequest.success`, `refund.pending`,
`refund.processing`, `subscription.not_renew`, and
`subscription.expiring_cards`.

## Event Payload Structure

All events share the same envelope: a top-level `event` string and a `data`
object. Unlike some providers, the entity lives **directly** under `data`
(there is no `data.entity` wrapper).

```json
{
  "event": "charge.success",
  "data": {
    "id": 302961,
    "domain": "live",
    "status": "success",
    "reference": "qTPrJoy9Bx",
    "amount": 10000,
    "currency": "NGN",
    "paid_at": "2024-01-15T10:23:45.000Z",
    "customer": {
      "id": 84312,
      "email": "customer@example.com",
      "customer_code": "CUS_xxxxxxxx"
    },
    "authorization": {
      "authorization_code": "AUTH_xxxxxxxx",
      "channel": "card",
      "bank": "Test Bank"
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `event` | The event type string, e.g. `charge.success` |
| `data` | The entity that the event is about (transaction, transfer, subscription, invoice, dispute, …) |
| `data.id` | Numeric identifier of the entity (use with `event` for idempotency) |
| `data.reference` | Transaction/transfer reference string (use for idempotency and API re-verification) |

Amounts are in the **smallest currency unit** (e.g. kobo for NGN — `10000` means
₦100.00; cents for USD/ZAR/GHS).

## Idempotency

Paystack **retries** deliveries that do not receive a fast `200` response, and
retries can produce **duplicate** deliveries. There is no documented idempotency
header, so dedupe on the combination of `event` + `data.id` (or
`data.reference`). See the
[idempotency reference](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).

## Full Event Reference

For the complete list of events and per-event payloads, see
[Paystack's webhook documentation](https://paystack.com/docs/payments/webhooks/).
