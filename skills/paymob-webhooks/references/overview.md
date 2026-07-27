# Paymob Webhooks Overview

## What Are Paymob Webhooks?

Paymob calls its webhooks **callbacks**. When a payment transaction reaches a
result on Paymob's side, Paymob notifies your integration by calling the
callback URLs you configured in the dashboard. Every callback carries an `hmac`
value you must verify (see [verification.md](verification.md)) before trusting
the payload.

There are two callback kinds per integration, and both describe the **same
transaction** using the **same fields**:

| Callback | Method | Body / params | Purpose |
|----------|--------|---------------|---------|
| **Transaction Processed Callback** | POST (server-to-server) | JSON `{ "type": "TRANSACTION", "obj": { … } }` | The authoritative notification your backend should act on |
| **Transaction Response Callback** | GET (browser redirect) | Flattened query params | Redirects the customer back to your site after payment |

Build your webhook handler on the **Transaction Processed Callback (POST)** — it
is server-to-server and reliable. The GET callback is a browser redirect used
for UX (showing the customer a result page).

## No Event Names — Read State From Booleans

Unlike most providers, Paymob does **not** send discrete event names like
`payment.succeeded`. Every callback has the single `type` value **`TRANSACTION`**.
You determine what happened by reading boolean fields on the transaction object:

| Fields | Transaction state | Common use case |
|--------|-------------------|-----------------|
| `success: true`, `is_refunded: false`, `is_voided: false`, `pending: false` | **Succeeded** | Fulfil the order, mark paid |
| `success: false`, `error_occured: true` | **Failed / declined** | Notify customer, release cart |
| `pending: true` | **Pending** | Awaiting 3-D Secure or async completion |
| `success: true`, `is_auth: true`, `is_capture: false` | **Authorized** | Funds held; capture later |
| `is_capture: true` | **Captured** | Complete a prior authorization |
| `is_refunded: true` | **Refunded** | Reverse fulfilment, credit customer |
| `is_voided: true` | **Voided** | Cancel an uncaptured authorization |

> Always check `success` together with `error_occured`, `pending`,
> `is_refunded`, and `is_voided` — a single boolean is rarely enough.

## Event Payload Structure

Transaction Processed Callback (POST) body:

```json
{
  "type": "TRANSACTION",
  "obj": {
    "id": 123456789,
    "amount_cents": 10000,
    "created_at": "2026-07-27T10:15:30.123456",
    "currency": "EGP",
    "error_occured": false,
    "has_parent_transaction": false,
    "integration_id": 987654,
    "is_3d_secure": true,
    "is_auth": false,
    "is_capture": false,
    "is_refunded": false,
    "is_standalone_payment": true,
    "is_voided": false,
    "pending": false,
    "success": true,
    "owner": 543210,
    "order": { "id": 222333444 },
    "source_data": { "pan": "2346", "sub_type": "MasterCard", "type": "card" }
  }
}
```

The 20 fields used for HMAC verification are (in order): `amount_cents`,
`created_at`, `currency`, `error_occured`, `has_parent_transaction`, `obj.id`,
`integration_id`, `is_3d_secure`, `is_auth`, `is_capture`, `is_refunded`,
`is_standalone_payment`, `is_voided`, `order.id`, `owner`, `pending`,
`source_data.pan`, `source_data.sub_type`, `source_data.type`, `success`.

## Full Event Reference

- [Webhooks / callbacks & HMAC](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac)
- [HMAC transaction callback](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback)
