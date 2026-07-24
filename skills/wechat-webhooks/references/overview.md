# WeChat Pay Webhooks Overview

## What Are WeChat Pay Webhooks?

WeChat Pay (APIv3) sends **notifications** to a `notify_url` you specify when you create a payment or refund. Notifications tell your server that a payment succeeded or a refund reached a terminal state, so you can fulfill orders and reconcile without polling.

WeChat Pay APIv3 notifications differ from most webhook providers in two ways:

1. **Asymmetric signing (SHA256withRSA).** Each notification is signed with WeChat Pay's private key. You verify it with the **WeChat Pay platform public key**, selected by the `Wechatpay-Serial` header. This is *not* HMAC and *not* the Standard Webhooks spec.
2. **Encrypted payload.** The business data lives inside `resource`, encrypted with `AEAD_AES_256_GCM`. You decrypt `resource.ciphertext` with your 32-byte **APIv3 key** to recover the transaction or refund JSON.

## Common Event Types

This skill targets the **Global (English) APIv3** endpoint, which defines the following events:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `TRANSACTION.SUCCESS` | A payment completed successfully | Mark order paid, fulfill, send receipt |
| `REFUND.SUCCESS` | A refund was processed successfully | Update order/refund status, notify customer |
| `REFUND.CLOSED` | A refund was closed without completing | Flag for manual review, retry, or reconciliation |

> **Note:** The mainland-China-only `REFUND.ABNORMAL` event is **not** part of the global endpoint this skill targets — do not handle it here.

## Notification Payload Structure

The outer (signed, but unencrypted) envelope:

```json
{
  "id": "EV-2018022511223320873",
  "create_time": "2015-05-20T13:29:35+08:00",
  "event_type": "TRANSACTION.SUCCESS",
  "resource_type": "encrypt-resource",
  "summary": "Payment succeeded",
  "resource": {
    "algorithm": "AEAD_AES_256_GCM",
    "ciphertext": "...base64...",
    "associated_data": "transaction",
    "nonce": "...12-byte IV...",
    "original_type": "transaction"
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique notification ID (use for idempotency) |
| `create_time` | RFC3339 timestamp of the notification |
| `event_type` | Event string, e.g. `TRANSACTION.SUCCESS` |
| `resource_type` | Always `encrypt-resource` |
| `resource.algorithm` | Always `AEAD_AES_256_GCM` |
| `resource.ciphertext` | Base64 ciphertext (auth tag is the last 16 bytes) |
| `resource.nonce` | 12-byte AES-GCM IV |
| `resource.associated_data` | Additional authenticated data (may be empty) |

### Decrypted `resource` (transaction)

After decrypting `resource.ciphertext` you get the business object, e.g. for a transaction:

```json
{
  "mchid": "1230000109",
  "appid": "wxd678efh567hg6787",
  "out_trade_no": "1217752501201407033233368018",
  "transaction_id": "1217752501201407033233368018",
  "trade_state": "SUCCESS",
  "success_time": "2018-06-08T10:34:56+08:00",
  "amount": { "total": 100, "currency": "USD", "payer_total": 100, "payer_currency": "USD" }
}
```

**Always re-verify `amount.total` and `out_trade_no` against your own order** before fulfilling — a valid signature only proves the message came from WeChat Pay, not that it matches what you expect.

## Handling and Retries

Acknowledge with HTTP **200** or **204**. The documented success body is `{"code":"SUCCESS","message":"OK"}` (optional). On failure, return a non-2xx status.

WeChat Pay retries failed notifications on a fixed schedule (~15s, 15s, 30s, 3m, 10m, 20m, 30m, 30m, 30m, 60m, 3h, 3h, 3h, 6h, 6h — roughly 24h total). Because retries and network conditions can deliver the same notification more than once, **process notifications idempotently** keyed on `id` or `transaction_id`.

## Full Event Reference

- [WeChat Pay APIv3 Notifications](https://pay.weixin.qq.com/doc/global/v3/en/4012356564)
- [Signature Verification](https://pay.weixin.qq.com/doc/global/v3/en/4012357149)
