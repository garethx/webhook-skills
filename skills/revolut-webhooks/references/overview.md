# Revolut Webhooks Overview

## What Are Revolut Webhooks?

Revolut Merchant webhooks notify your application about the lifecycle of orders
and payments in real time — for example when an order is authorised, completed,
cancelled, or when a payment is declined. Instead of polling the Merchant API,
you register an HTTPS endpoint and Revolut sends a `POST` request to it whenever
a subscribed event occurs.

Webhooks are configured **via the Merchant API only** (there is no dashboard
toggle). Each webhook has a **signing secret** (prefix `wsk_`) used to verify
that requests genuinely came from Revolut. You can register up to **10 webhook
URLs** per merchant account.

> Revolut's **Business API** has a separate webhook system that uses the same
> `v1` signature scheme described here.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ORDER_COMPLETED` | The order is fully paid and captured | Fulfil the order, send a receipt |
| `ORDER_AUTHORISED` | Payment is authorised (funds held, not yet captured) | Reserve stock, start fulfilment for capture-later flows |
| `ORDER_CANCELLED` | The order is cancelled | Release reserved stock, update order status |
| `ORDER_PAYMENT_AUTHENTICATED` | The customer completes payment authentication (e.g. 3-D Secure) | Track authentication progress |
| `ORDER_PAYMENT_DECLINED` | The payment is declined by the issuer or Revolut | Notify the customer, offer another payment method |
| `ORDER_PAYMENT_FAILED` | The payment fails due to a processing error | Retry, alert the customer |

> Revolut does **not** guarantee event delivery order. For a completed order you
> typically receive `ORDER_AUTHORISED` and then `ORDER_COMPLETED`, but your
> implementation must not rely on ordering. Treat events idempotently and, when
> you need the authoritative state, retrieve the order via the Merchant API.

## Event Payload Structure

Order webhook payloads are intentionally small — they carry identifiers, not the
full order. Fetch the order from the Merchant API when you need details.

```json
{
  "event": "ORDER_COMPLETED",
  "order_id": "6516e61c-d279-a454-a837-bc52ce55ed49",
  "merchant_order_ext_ref": "Order #2937"
}
```

| Field | Description |
|-------|-------------|
| `event` | The event type (e.g. `ORDER_COMPLETED`) |
| `order_id` | Revolut's ID for the order — use it to retrieve full order details |
| `merchant_order_ext_ref` | Your own external reference for the order, if you set one |

## Delivery, Retries, and Source IPs

- **Retries:** If your endpoint does not return a `2xx` response, Revolut retries
  up to **3 more times at 10-minute intervals**.
- **Source IPs:** Requests originate from documented Revolut IPs —
  production: `35.246.21.235`, `34.89.70.170`;
  sandbox: `35.242.130.242`, `35.242.162.241`. You can allowlist these in
  addition to (never instead of) verifying the signature.
- **Hosts:** Production `merchant.revolut.com`; sandbox
  `sandbox-merchant.revolut.com`.

## Full Event Reference

For the complete list of events and payloads, see
[Revolut's webhook documentation](https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/using-webhooks).
