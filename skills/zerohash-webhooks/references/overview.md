# Zero Hash Webhooks Overview

## What Are Zero Hash Webhooks?

[Zero Hash](https://zerohash.com) is a B2B crypto infrastructure and settlement
platform. Webhooks let your platform receive real-time notifications when a
trade's settlement status changes or when an account balance updates — instead
of polling the REST API.

Zero Hash delivers each notification as an HTTP `POST` to a destination URL that
a Zero Hash representative configures for your Platform. Every request is signed
so you can verify it is authentic (see
[verification.md](verification.md)).

## Common Event Types

The event type is delivered in the **`x-zh-hook-payload-type` header**, not in
the JSON body.

| `x-zh-hook-payload-type` | Triggered When | Common Use Cases |
|--------------------------|----------------|------------------|
| `trade_status_changed` | A trade moves between settlement statuses (`accepted` → `active` → `terminated`) | Update order state, reconcile settlement, notify the customer |
| `account_balance.changed` | An `available` or `collateral` account balance changes | Track available funds, monitor collateral, trigger downstream ledger updates |

### Trade status values

The `trade_status_changed` payload reports one of three statuses:

| Status | Meaning |
|--------|---------|
| `accepted` | Trade successfully submitted and awaiting settlement |
| `active` | Settlement is in progress within the settlement window |
| `terminated` | Trade successfully settled — no further updates will follow |

### Account balance types

`account_balance.changed` covers two account types:

- `available` — spendable balance
- `collateral` — balance held as collateral

## Event Payload Structure

Standard headers on every delivery:

| Header | Description |
|--------|-------------|
| `x-zh-hook-payload-type` | Event type (`trade_status_changed` / `account_balance.changed`) |
| `x-zh-hook-notification-id` | Unique notification identifier — use for idempotency |
| `x-zh-hook-signature` | HMAC-SHA256 (hex) of `payload + timestamp` (recommended scheme) |
| `x-zh-hook-timestamp` | UNIX timestamp in milliseconds that was signed |
| `x-zh-hook-signature-256` | Legacy HMAC-SHA256 (hex) of `payload` only |
| `x-zh-hook-rsa-signature` / `x-zh-hook-rsa-signature-256` | RSA-SHA256 (hex) variants |

The JSON body varies by payload type:

- **`trade_status_changed`** mirrors the `GET /trades/{trade_id}` response but
  omits some fields (timestamps, fees, session identifiers). Query
  `GET /trades/{trade_id}` for the complete record when you need those fields.

  ```json
  {
    "trade_id": "b7c2f4e0-1d3a-4b6c-8e9f-0a1b2c3d4e5f",
    "status": "terminated",
    "symbol": "BTC/USD",
    "quantity": "0.5",
    "price": "60000.00",
    "side": "buy"
  }
  ```

- **`account_balance.changed`** mirrors the private websocket balance feed:

  ```json
  {
    "account_group": "00SCXM",
    "account_label": "general",
    "asset": "USD",
    "account_type": "available",
    "balance": "1500.00"
  }
  ```

> Field names above are illustrative. Zero Hash omits some fields from webhook
> payloads compared with the REST endpoints — treat the webhook as a signal to
> fetch authoritative data from the API when you need fields it does not include.

## Full Event Reference

- Webhooks changelog & payloads: https://docs.zerohash.com/changelog/webhooks-tradestatus-balanceupdates
- Webhook security: https://docs.zerohash.com/reference/webhook-security
