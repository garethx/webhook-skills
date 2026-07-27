# NMI Webhooks Overview

## What Are NMI Webhooks?

NMI (Network Merchants) is a payment gateway. Webhooks notify your application in
near real time when a transaction changes state — a sale is approved, an
authorization is captured, a refund is issued, and so on — so you don't have to
poll the Query API.

NMI webhooks are unusual in two ways worth internalising up front:

1. **They are not [Standard Webhooks](https://www.standardwebhooks.com/).** The
   single `Webhook-Signature` header has the form `t=<nonce>,s=<signature>`.
2. **`t` is a NONCE, not a Unix timestamp.** It is a random per-delivery value
   that is folded into the signed content. Because it is not a timestamp, NMI
   documents no replay/timestamp tolerance — do not reject deliveries by age.

## Event Payload Structure

Every delivery has the same envelope:

```json
{
  "event_id": "b7f1c0d2-3e4a-4b5c-8d6e-7f8091a2b3c4",
  "event_type": "transaction.sale.success",
  "event_body": {
    "merchant": {
      "merchant_id": "900000",
      "gateway_id": "12345"
    },
    "transaction": {
      "transaction_id": "9876543210",
      "transaction_type": "sale",
      "condition": "complete",
      "amount": "49.99",
      "order_id": "ORDER-1001",
      "processor_id": "ccprocessora"
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `event_id` | Unique id for this delivery — use it for idempotency/deduplication |
| `event_type` | Dotted lowercase `transaction.<action>.<result>` (see below) |
| `event_body` | Event-specific data — the transaction/merchant details for the event |

The exact shape of `event_body` depends on the event. For transaction events it
mirrors the gateway's transaction record (transaction id, type, amount, order id,
customer and payment details, etc.).

## Event Types: the `transaction.<action>.<result>` matrix

Event names are built from an **action** and a **result**:

- **action** — one of `sale`, `auth`, `capture`, `void`, `refund`, `credit`, `validate`
- **result** — one of `success`, `failure`, `unknown`

That yields names like `transaction.sale.success`, `transaction.auth.failure`,
`transaction.refund.success`, and `transaction.void.unknown`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `transaction.sale.success` | A sale (auth + capture in one step) is approved | Fulfil order, send receipt |
| `transaction.sale.failure` | A sale is declined | Notify customer, start dunning |
| `transaction.sale.unknown` | A sale's result is indeterminate (e.g. processor timeout) | Flag for manual review / Query API lookup |
| `transaction.auth.success` | An authorization is approved (funds reserved) | Hold order, await capture |
| `transaction.auth.failure` | An authorization is declined | Notify customer |
| `transaction.capture.success` | A prior authorization is captured | Mark order paid, fulfil |
| `transaction.void.success` | A transaction is voided before settlement | Release hold, cancel order |
| `transaction.refund.success` | A settled transaction is refunded | Reverse fulfilment, notify customer |
| `transaction.credit.success` | An unreferenced credit is issued | Payout/adjustment bookkeeping |
| `transaction.validate.success` | A card validation (zero-dollar/verify) succeeds | Save card on file |

The `.failure` and `.unknown` variants exist for every action; the `.unknown`
result means the gateway could not determine the outcome (retry or query it).

### A note on scope

The **documented event catalog is transaction-lifecycle only** — the actions and
results above. NMI's control panel exposes additional event *categories* in its
UI (check status, recurring/subscriptions, settlement batches, chargebacks where
the processor supports them, Automatic Card Updater), but the transaction events
are the ones with a stable, documented `transaction.<action>.<result>` naming
scheme. **There are no distinct chargeback event names in the documented
transaction catalog.** Verify any non-transaction event name against your own
deliveries before hard-coding it.

## Delivery Behaviour

- **Retries.** NMI retries deliveries that don't receive a `2xx`. Respond `200`
  quickly and do slow work asynchronously so you don't trigger unnecessary
  retries.
- **Idempotency.** Because of retries (and at-least-once delivery), the same
  `event_id` can arrive more than once. Deduplicate on `event_id`.
- **Source IPs.** Deliveries originate from NMI's published ranges
  (`104.192.32.81–104.192.32.87` and `104.192.36.81–104.192.36.87`). An IP
  allowlist can be a defence-in-depth layer, but the `Webhook-Signature` HMAC is
  the authoritative check.

## Full Event Reference

- [NMI Webhooks documentation](https://docs.nmi.com/reference/overview)
