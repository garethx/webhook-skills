# Utila Webhooks Overview

## What Are Utila Webhooks?

[Utila](https://utila.io) is a digital-asset operations platform (wallets,
transactions, and treasury). Webhooks push a notification to your HTTPS endpoint
whenever a transaction or wallet changes state, so your systems can react without
polling the API.

Webhooks are configured per **vault** in the Utila Console under
**Vault Settings → Webhooks**. Each webhook has a destination URL and is signed
with an RSA-4096 key pair; you verify deliveries with the public key shown in the
Console. See [setup.md](setup.md).

## Common Event Types

Utila emits exactly five event types. The value appears in the payload's `type`
field as SCREAMING_SNAKE_CASE:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `TRANSACTION_CREATED` | A new transaction is created | Record a pending transfer, start tracking |
| `TRANSACTION_STATE_UPDATED` | A transaction changes state | Reconcile signing / completed / failed states |
| `WALLET_CREATED` | A new wallet is created | Provision downstream accounts, index the wallet |
| `WALLET_ADDRESS_CREATED` | A new address is generated for a wallet | Register deposit addresses, update address book |
| `TRANSACTION_AML_SCREENING_RESULT_READY` | An AML screening result is available | Gate settlement on compliance, alert on hits |

## Event Payload Structure

Utila payloads are **thin** — they identify *what* changed, not the full object.
Fetch the complete resource from the Utila API / Stream using the `resource` path.

Common fields present across events:

| Field | Description |
|-------|-------------|
| `id` | Unique event identifier — use this to dedupe deliveries |
| `vault` | The vault the event belongs to |
| `type` | The event type (one of the five above) |
| `resourceType` | `TRANSACTION`, `WALLET`, or `WALLET_ADDRESS` |
| `resource` | Full resource path (use to fetch the object via the API) |
| `details` | Optional, event-specific data (e.g. `transactionStateUpdated`, `transactionAmlScreeningResultReady`) |

Example (illustrative):

```json
{
  "id": "evt_01HZY...",
  "vault": "vaults/abc123",
  "type": "TRANSACTION_STATE_UPDATED",
  "resourceType": "TRANSACTION",
  "resource": "vaults/abc123/transactions/tx_456",
  "details": {
    "transactionStateUpdated": {
      "state": "STATE_COMPLETED"
    }
  }
}
```

## Delivery & Retries

- Your endpoint must return **HTTP 200** to acknowledge receipt.
- Failed deliveries (non-200 or unreachable) are retried with **exponential
  back-off for up to 24 hours**, after which the event is considered undeliverable
  and discarded.
- There is **no timestamp header** and thus no built-in replay protection —
  dedupe on the event `id` and make handlers idempotent.

## Full Event Reference

For the complete, authoritative list of events and payloads, see
[Utila's webhook documentation](https://docs.utila.io/reference/webhooks).
