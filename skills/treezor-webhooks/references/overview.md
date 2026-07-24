# Treezor Webhooks Overview

## What Are Treezor Webhooks?

[Treezor](https://www.treezor.com/) is a European Banking-as-a-Service (BaaS)
platform. Webhooks let Treezor notify your application in real time when banking
events occur — incoming payments, card authorizations, KYC status changes, SEPA
transfers, and more — instead of polling the API.

Treezor delivers each webhook as an HTTP `POST` to your registered URL with a
**`text/plain` MIME type** (the body is JSON despite the content type, so parse it
yourself). Every body includes an HMAC signature field so you can verify authenticity.

## Webhook Body Structure

```json
{
  "webhook": "payin.create",
  "webhook_id": "6f3b3f9e-1c2d-4a5b-8e7f-0a1b2c3d4e5f",
  "webhook_created_at": "1690000000.0000",
  "object": "payin",
  "object_id": "123456",
  "object_payload": { "payinId": "123456", "amount": "42.00", "currency": "EUR" },
  "object_payload_signature": "base64-hmac-sha256-of-canonical-object_payload"
}
```

| Field | Description |
|-------|-------------|
| `webhook` | Event name in `object.action` form (e.g. `payin.create`) |
| `webhook_id` | UUID v4 for this delivery — use it to **dedupe** (duplicates may reuse the same ID) |
| `webhook_created_at` | Unix epoch timestamp — compare these to order events, not receipt time |
| `object` | Treezor object type (e.g. `payin`, `card`, `wallet`) |
| `object_id` | ID of the affected object |
| `object_payload` | The object's data — **this is what the signature covers** |
| `object_payload_signature` | Base64 HMAC-SHA256 of the canonicalized `object_payload` |

> ⚠️ **Only `object_payload` is signed.** Everything else in this table —
> `webhook`, `webhook_id`, `webhook_created_at`, `object`, `object_id` — is
> outside the signed region and remains untrusted after verification. Use it for
> logging and routing, and derive business state from `object_payload`. See
> [verification.md](verification.md).

## Common Event Types

Events are `object.action`. The `webhook` field carries the full string.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payin.create` | Incoming funds recorded | Credit a wallet, notify the user |
| `payin.update` | Pay-in state changes | Track settlement/refund state |
| `payout.create` | Outgoing SEPA transfer created | Confirm a withdrawal was initiated |
| `payout.update` | Payout state changes | Track execution/rejection |
| `transfer.create` | Wallet-to-wallet transfer created | Update balances |
| `transaction.create` | Ledger transaction recorded | Reconciliation, statements |
| `cardtransaction.create` | Card authorization/settlement | Real-time spend notifications |
| `card.create` | Card issued | Activate the card in your UI |
| `card.update` | Card status/limits change | Reflect lock/unlock, limit changes |
| `wallet.create` | Wallet opened | Provision an account for the user |
| `user.create` | User created | Onboarding flows |
| `user.update` | User data changes | Sync profile changes |
| `user.kycreview` | KYC review status changes | Gate features on KYC level |

Some objects are camelCase or multi-segment, e.g. `sca.wallet.create` (Strong Customer
Authentication) and `qes.created` (Qualified Electronic Signature).

## Ordering and Duplicates

- Treezor sends webhooks **chronologically**, but does **not** guarantee your server
  receives them in order. Compare `webhook_created_at` to find the latest state.
- Deliveries can be **duplicated**. Dedupe on `webhook_id` before acting.

## Sandbox

Not every event is available in Sandbox. Test against the events your integration
actually depends on and consult the environment docs for gaps.

## Full Event Reference

For the complete list of events and payloads, see the
[Treezor Webhooks documentation](https://docs.treezor.com/guide/webhooks/introduction.html).
