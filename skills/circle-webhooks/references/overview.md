# Circle Webhooks Overview

## What Are Circle Webhooks?

Circle sends webhook notifications to inform your application about the progress
of payments and onchain transactions on the **Circle Payments Network (CPN)**.
When something happens — a payment completes, an onchain transaction is
broadcast, a request-for-information (RFI) is approved — Circle POSTs a JSON
notification to the endpoint(s) you have subscribed.

These are **v2** notifications: each request is signed with an asymmetric
**ECDSA** key (not HMAC, not the Standard Webhooks spec). You verify the
signature with a public key you fetch from Circle's API. See
[verification.md](verification.md).

> **Product note:** This skill covers **Circle Payments Network (CPN) v2**
> notifications, whose events use a `notificationType` field carrying `cpn.*`
> strings (below). Circle Mint / Core API (v1) is a **separate** product with a
> different notification scheme, and Circle's W3S / Programmable Wallets is
> different again — don't mix them.

## Event / Notification Types

CPN identifies each event by a `notificationType` field in the payload body
(not a header), a `cpn.*` string. You choose which to receive with a
subscription's `notificationTypes` (which accepts wildcards). The types:

| `notificationType` | Triggered When | Common Use Cases |
|--------------------|----------------|------------------|
| `cpn.payment.completed` | A CPN payment reached the completed state | Reconcile completed payments, credit accounts |
| `cpn.payment.failed` | A CPN payment failed | Notify the customer, retry or unwind |
| `cpn.payment.delayed` | A CPN payment is delayed | Surface pending state to the user |
| `cpn.transaction.broadcasted` | An onchain transaction was broadcast | Track the pending onchain transaction |
| `cpn.transaction.completed` | An onchain transaction completed | Mark onchain settlement |
| `cpn.transaction.failed` | An onchain transaction failed | Handle the failed transaction |
| `cpn.rfi.approved` | A request-for-information (RFI) was approved | Resume the held payment |
| `cpn.rfi.rejected` | A request-for-information (RFI) was rejected | Handle the rejected RFI |

Wildcards let a subscription match a whole family — `cpn.payment.*`,
`cpn.transaction.*`, `cpn.rfi.*` (the RFI family also includes an
information-needed variant) — or `*` to receive every type.

### Status Values

The lifecycle status lives inside the `notification` object as
`notification.status`. Typical values by family:

| Family | Typical status values |
|--------|-----------------------|
| `cpn.payment.*` | `pending`, `delayed`, `completed`, `failed` |
| `cpn.transaction.*` | `broadcasted`, `completed`, `failed` |
| `cpn.rfi.*` | `needed`, `approved`, `rejected` |

## Event Payload Structure

Every notification includes a `notificationId` (a UUID, your idempotency /
dedupe key), a `notificationType`, the `notification` object (the resource that
changed — its shape matches the corresponding API response), a `timestamp`, and
`version: 2`:

```json
{
  "notificationId": "2a7f0c8e-6b1d-4f9a-8c3e-1e2d3c4b5a60",
  "notificationType": "cpn.payment.completed",
  "notification": {
    "id": "66c56b6a-fc79-338b-8b94-aacc4f0f18de",
    "status": "completed",
    "transactionHash": "0x7351585460bd657f320b9afa02a52c26d89272d0d10cc29913eb8b28e64fd906"
  },
  "timestamp": "2026-04-12T20:13:39.000000Z",
  "version": 2
}
```

A `cpn.transaction.broadcasted` notification carries the transaction resource in
the same `notification` envelope:

```json
{
  "notificationId": "3b8a1d9f-7c2e-4a0b-9d4f-2f3e4d5c6b71",
  "notificationType": "cpn.transaction.broadcasted",
  "notification": {
    "id": "e2e90ba3-9d1f-490d-9460-24ac6eb55a1b",
    "status": "broadcasted",
    "transactionHash": "0x7351585460bd657f320b9afa02a52c26d89272d0d10cc29913eb8b28e64fd906"
  },
  "timestamp": "2026-04-12T20:13:39.000000Z",
  "version": 2
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
