# Solidgate Webhooks Overview

## What Are Solidgate Webhooks?

Solidgate sends webhooks (HTTP POST requests) to your endpoint whenever a
payment, subscription, chargeback, or fraud event occurs. This lets your backend
react to state changes — fulfilling orders, activating subscriptions, or handling
disputes — without polling the API.

Webhooks are configured per **channel** in the Solidgate Hub, and each delivery
is signed so you can verify it came from Solidgate (see
[verification.md](verification.md)).

## Common Event Types

The event type is delivered in the `solidgate-event-type` HTTP header.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `card_gate.order.updated` | A card payment order changes status (approved, declined, refunded, settled) | Fulfil orders, reconcile payments, trigger receipts |
| `card_gate.chargeback.received` | A chargeback is opened on a card order | Revoke access, update accounting, open a dispute workflow |
| `card_gate.fraud_alert.received` | A fraud alert (TC40/SAFE) is received | Flag risky customers, pre-empt chargebacks |
| `card_gate.prevention_alert.received` | A prevention alert (RDR/Ethoca) is received | Auto-refund to avoid a chargeback |
| `subscription.updated.v2` | A subscription changes state (active, cancelled, past due, redemption) | Grant/revoke entitlements, dunning |
| `alt_gate.order.updated` | An alternative payment method (APM) order changes status | Fulfil APM orders, reconcile |
| `alt_gate.paypal_dispute.received` | A PayPal dispute is opened | Handle PayPal disputes |

> The `.v2` suffix on `subscription.updated.v2` is intentional and part of the
> real event name — do not strip it.

## Additional Event Types

Solidgate also emits (channel-dependent):

- `card.network_token.created` / `card.network_token.updated` — network tokenization
- `alt_gate.recurring_token.cancelled` — APM recurring token cancelled
- `taxer.tax.calculated` — tax calculation completed

## Event Payload Structure

Every delivery includes these HTTP headers alongside the signed body:

| Header | Purpose |
|--------|---------|
| `merchant` | Your webhook public key (`wh_pk_…`) |
| `signature` | HMAC-SHA512 signature (Base64 of the hex digest) |
| `solidgate-event-id` | Unique event UUID — use for **idempotency** |
| `solidgate-event-type` | The event type (e.g. `card_gate.order.updated`) |
| `solidgate-event-created-at` | ISO 8601 timestamp of the event |

The JSON body varies by event. Order events typically include an `order` object
(with `order_id`, `status`, `amount`, `currency`) and, for card events, a
`transactions` collection. Subscription events include a `subscription` object.

## Full Event Reference

For the complete list of events and payload schemas, see
[Solidgate's webhook documentation](https://docs.solidgate.com/payments/integrate/webhooks/).
