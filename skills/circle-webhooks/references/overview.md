# Circle Webhooks Overview

## What Are Circle Webhooks?

Circle sends webhook notifications to inform your application about the progress
of payments, transfers, and payouts on the **Circle Payments Network (CPN)** and
Circle Mint. When something happens — a deposit address is assigned, a stablecoin
payin settles, an onchain transfer changes state — Circle POSTs a JSON
notification to the endpoint(s) you have subscribed.

These are **v2** notifications: each request is signed with an asymmetric
**ECDSA** key (not HMAC, not the Standard Webhooks spec). You verify the
signature with a public key you fetch from Circle's API. See
[verification.md](verification.md).

> **Product note:** This skill covers CPN / Circle Mint notifications, whose
> events use a `notificationType` field (below). This is a **different** product
> from Circle's W3S / Programmable Wallets, whose webhooks use `transactions.inbound`
> / `transactions.outbound` event types. Don't mix the two.

## Event / Notification Types

Circle identifies each event by a `notificationType` field in the payload body
(not a header). The most common CPN / Circle Mint notification types:

| `notificationType` | Triggered When | Common Use Cases |
|--------------------|----------------|------------------|
| `paymentIntents` | A payin intent is created, a deposit address is assigned, or the intent reaches a terminal state | Show a deposit address, track intent lifecycle |
| `payments` | An inbound stablecoin payin settles, or a payout refund occurs | Reconcile settled deposits, credit accounts |
| `transfers` | An onchain transfer changes state (either direction) | Track onchain settlement |
| `payouts` | A fiat redemption (burn) or stablecoin payout changes state | Reconcile outbound payments |

Other notification types you may receive depending on the products you use:
`deposits`, `settlements`, `wire`, `addressBookRecipients`, `externalEntities`,
`creditTransfers`, `creditFees`, `creditRepayments`,
`approvalWorkflowTransferApproved`, `approvalWorkflowTransferRejected`.

### Status Values

The lifecycle status lives inside the object (e.g. `payment.status`,
`transfer.status`) or in a `timeline` array for payment intents (newest entry
first).

| Type | Typical status values |
|------|-----------------------|
| `paymentIntents` | `created`, `pending`, `active`, `complete`, `expired`, `failed`, `refunded` |
| `payments` | `pending`, `confirmed`, `paid`, `failed`, `action_required` |
| `transfers` | `pending`, `running`, `complete`, `failed` |
| `payouts` | `pending`, `complete`, `failed` |

## Event Payload Structure

Every notification includes a `notificationType`, a `version`, and a nested
object named after the resource:

```json
{
  "notificationType": "payments",
  "version": 1,
  "payment": {
    "id": "66c56b6a-fc79-338b-8b94-aacc4f0f18de",
    "status": "paid",
    "paymentIntentId": "e2e90ba3-9d1f-490d-9460-24ac6eb55a1b",
    "transactionHash": "0x7351585460bd657f320b9afa02a52c26d89272d0d10cc29913eb8b28e64fd906"
  }
}
```

A `paymentIntents` notification carries a `paymentIntent` object with a
`timeline` array (newest status first):

```json
{
  "notificationType": "paymentIntents",
  "version": 1,
  "paymentIntent": {
    "id": "e2e90ba3-9d1f-490d-9460-24ac6eb55a1b",
    "timeline": [
      { "status": "active", "time": "2026-04-12T20:13:39.000000Z" },
      { "status": "created", "time": "2026-04-12T20:13:38.188286Z" }
    ]
  }
}
```

## Delivery Behavior

- Circle delivers over public **HTTPS** and expects a **200** response. Any
  non-200 response triggers **retries**.
- On subscription create/update Circle validates the endpoint with a **HEAD**
  request — your endpoint must return 200 to a HEAD as well as a POST.
- Optionally allowlist Circle's egress IPs: `35.169.154.32`, `3.90.127.28`,
  `3.230.111.7`, `54.88.227.75`.

## Full Event Reference

- CPN webhooks: https://developers.circle.com/cpn/guides/webhooks/setup-webhook-notifications
- Circle Mint webhook notifications: https://developers.circle.com/circle-mint/references/webhook-notifications
