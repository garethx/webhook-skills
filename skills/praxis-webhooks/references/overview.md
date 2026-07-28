# Praxis Webhooks Overview

## What Are Praxis Webhooks?

Praxis (Praxis Tech) is a payment orchestration platform — its hosted checkout is
branded **Cashier**. When a transaction or subscription changes state, Praxis
sends a **server-to-server notification** (webhook) to a URL you configure in
your merchant settings. Every notification is signed with a **SHA-384** digest in
the lowercase `gt-authentication` header so you can confirm it genuinely came
from Praxis.

Praxis expects your endpoint to reply **HTTP 200** with a JSON body containing
`"status": 0` **and** to sign that acknowledgement with the
`external-request-signature` header. If the acknowledgement is missing, malformed,
or unsigned, Praxis treats the delivery as failed and retries.

There is **no official server-side SDK** — Praxis only ships a browser-side
Cashier JS SDK. All webhook verification is done manually with your platform's
standard crypto library (`sha384`), as shown in this skill's examples.

## Notification Types

Praxis sends two webhook shapes. You tell them apart by a single field: a
**Subscription Notification carries an `event` field**; a **Payment Notification
does not** (it is identified by `transaction.transaction_status` instead).

### Payment Notification

Fires as a transaction moves through its lifecycle. Identified by
`transaction.transaction_status`:

| `transaction_status` | Triggered when | Common use cases |
|----------------------|----------------|------------------|
| `initialized` | Transaction created | Record the transaction |
| `pending` | Awaiting completion | Show "processing", hold fulfilment |
| `approved` | Transaction approved / funds captured | Fulfil the order, grant access, receipt |
| `rejected` | Transaction declined | Prompt retry / alternate method |
| `error` | A processing error occurred | Log, alert, investigate |

**Signed fields, in this exact order** (values concatenated, then Merchant
Secret appended):

1. `merchant_id`
2. `application_key`
3. `timestamp`
4. `customer.customer_token`
5. `session.order_id`
6. `transaction.tid`
7. `transaction.currency`
8. `transaction.amount`
9. `transaction.conversion_rate`
10. `transaction.processed_currency`
11. `transaction.processed_amount`

### Subscription Notification

Fires for recurring-billing / subscription lifecycle changes. Identified by the
explicit `event` field, and carries `subscription_status` (one of `active`,
`inactive`, `expired`, `canceled`):

| `event` | Fires when |
|---------|------------|
| `SubscriptionCreated` | A subscription is created |
| `SubscriptionActivated` | A subscription becomes active |
| `SubscriptionDeactivated` | A subscription is deactivated |
| `SubscriptionExpired` | A subscription expires |
| `SubscriptionCanceled` | A subscription is canceled |
| `PaymentAttemptApproved` | A recurring charge attempt is approved |
| `PaymentAttemptFailed` | A recurring charge attempt fails |
| `PaymentSucceeded` | A subscription payment succeeds |
| `PaymentFailed` | A subscription payment fails |
| `PaymentManuallyPaid` | A payment is marked manually paid |
| `PaymentRefundSucceeded` | A refund succeeds |
| `PaymentRefundFailed` | A refund fails |

**Signed fields, in this exact order:**

1. `event`
2. `merchant_id`
3. `application_key`
4. `cid`
5. `plan_id`
6. `subscription_id`
7. `subscription_status`
8. `timestamp`

The exact `event` and `subscription_status` string values are program-specific —
confirm the set enabled for your account in the Praxis documentation.

## Event Payload Structure

A Payment Notification is a JSON object with nested `customer`, `session`, and
`transaction` objects, for example:

```json
{
  "merchant_id": "123456",
  "application_key": "app_key_abc",
  "timestamp": 1700000000,
  "customer": { "customer_token": "cust_abc" },
  "session": { "order_id": "order_789" },
  "transaction": {
    "tid": "tx_555",
    "currency": "USD",
    "amount": "10.00",
    "conversion_rate": "1.00",
    "processed_currency": "USD",
    "processed_amount": "10.00",
    "transaction_status": "approved"
  }
}
```

> **Amounts arrive as strings.** Preserve them exactly — see
> [verification.md](verification.md) for why re-serializing them breaks the signature.

## Full Event Reference

For the complete, authoritative list of notification fields and event values, see
Praxis's [webhook documentation](https://docs.praxis.tech/reference/webhooks) and
[authentication guide](https://docs.praxis.tech/docs/authentication).
