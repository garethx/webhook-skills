# Token.io Webhooks Overview

## What Are Token.io Webhooks?

[Token.io](https://token.io) is an open banking / account-to-account (A2A)
payments platform. When the state of a payment, refund, VRP, payout, or virtual
account changes, Token.io sends an HTTP POST to the webhook URL you registered.
This lets your application react to bank-driven status changes asynchronously
instead of polling the API.

Each delivery is **asymmetrically signed with Ed25519**:

- **`token-signature`** header — the Ed25519 signature of the raw POST body, base64url encoded.
- **`token-event`** header — the event type (e.g. `PAYMENT_STATUS_CHANGED`).

You verify with your member's Ed25519 **public** key from the Token Dashboard.
See [verification.md](verification.md) for details.

## Common Event Types

The event type is delivered in the **`token-event`** HTTP header, not inside the
JSON body. Subscribe to the events you care about via `PUT /webhook/config`.

| Event (`token-event`) | Triggered When | Common Use Cases |
|-----------------------|----------------|------------------|
| `PAYMENT_STATUS_CHANGED` | A Payments v2 payment changes status | Update order state, trigger fulfilment |
| `TRANSFER_STATUS_CHANGED` | A Payments v1 transfer changes status | Legacy payment tracking |
| `REFUND_STATUS_CHANGED` | A refund changes status | Reconcile refunds |
| `VRP_STATUS_CHANGED` | A Variable Recurring Payment changes status | Subscriptions, sweeping |
| `VRP_CONSENT_STATUS_CHANGED` | A VRP consent / mandate changes status | Mandate lifecycle management |
| `VIRTUAL_ACCOUNT_CREDIT_RECEIVED` | A virtual account (payin) is credited | Reconcile inbound funds |
| `PAYOUT_STATUS_CHANGED` | A payout changes status | Settlement tracking |
| `SETTLEMENT_RULE_PAYOUT_EXECUTION_FAILED` | A settlement-rule payout fails to execute | Alerting, manual intervention |
| `BANK_AIS_OUTAGE_STATUS_CHANGED` | A bank's AIS (data) availability changes | Route around bank outages |
| `BANK_SIP_OUTAGE_STATUS_CHANGED` | A bank's SIP (payments) availability changes | Route around bank outages |

## Event Payload Structure

The payload is a JSON object whose shape depends on the event. For
`PAYMENT_STATUS_CHANGED` (Payments v2), the body carries a `payment` object:

```json
{
  "payment": {
    "id": "a4hV9mQ2Zx7...",
    "memberId": "m:3xamp1e:5tuv",
    "status": "INITIATION_COMPLETED",
    "bankPaymentStatus": "ACSC",
    "bankPaymentId": "bank-ref-0001",
    "createdDateTime": "2026-07-27T10:00:00Z",
    "updatedDateTime": "2026-07-27T10:01:12Z"
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Token.io payment identifier |
| `memberId` | Your TPP member ID from the original payment request |
| `status` | Token.io normalized payment status (see below) |
| `bankPaymentStatus` | Raw ISO 20022 status code from the bank (e.g. `ACSC`, `RJCT`) |
| `bankPaymentId` | The bank's own payment identifier |
| `createdDateTime` / `updatedDateTime` | ISO 8601 timestamps |

## Payment Status Values

The normalized `status` (Payments v2) is one of:

| `status` | Meaning |
|----------|---------|
| `INITIATION_PROCESSING` | The payment initiation is in progress at the bank |
| `INITIATION_COMPLETED` | The bank accepted the initiation |
| `INITIATION_REJECTED` | The bank rejected the initiation |
| `SUCCESS` | Funds settlement confirmed (where the bank reports it) |

Drive your business logic off the normalized `status`. Keep `bankPaymentStatus`
for audit trails and debugging — it is the raw bank code and varies by ASPSP.

## Delivery & Retries

- Your endpoint **must return HTTP 200** to acknowledge a delivery.
- Non-200 responses are retried with **exponential backoff** (~10, 30, 70, 150 minutes, …).
- Retries continue for up to **72 hours** (~10 attempts) before the delivery is dropped.
- Because deliveries can be retried, the **same status change can arrive more than once** — handle events idempotently (key off `payment.id` + `status`).

## Full Event Reference

For the complete list of events, payload schemas, and status codes, see the
[Token.io webhooks documentation](https://docs.token.io/products/tpp/integration-considerations/webhooks).
