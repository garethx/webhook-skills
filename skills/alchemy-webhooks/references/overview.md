# Alchemy Webhooks Overview

## What Are Alchemy Webhooks?

Alchemy **Notify** webhooks push real-time onchain notifications to your endpoint whenever activity you
care about happens on a supported chain — an address receives funds, a transaction is mined or dropped,
an NFT is transferred, or a custom GraphQL query matches new data. Instead of polling an RPC node, you
register a webhook once and Alchemy delivers an HTTP `POST` with a JSON payload as events occur.

Webhooks are **scoped per chain/network** (e.g. `ETH_MAINNET`, `MATIC_MAINNET`). Each webhook has its
own **signing key** used to authenticate deliveries.

## Common Event Types

The top-level `type` field identifies the webhook. These are the exact strings Alchemy sends:

| Type | Triggered When | Common Use Cases |
|------|----------------|------------------|
| `ADDRESS_ACTIVITY` | ETH, ERC-20, ERC-721 and ERC-1155 transfers involving a tracked address (up to 100k addresses per webhook) | Wallet balance updates, deposit detection, accounting |
| `MINED_TRANSACTION` | A transaction you submitted is mined into a block | Confirm sends, update order status, unlock features |
| `DROPPED_TRANSACTION` | A submitted transaction is dropped from the mempool | Resubmit with higher gas, alert users, roll back UI |
| `NFT_ACTIVITY` | ERC-721 / ERC-1155 transfers for tracked NFT contracts | Marketplace feeds, ownership tracking, mint alerts |
| `NFT_METADATA_UPDATE` | Metadata for a tracked NFT is refreshed | Refresh cached media/attributes, re-index collections |
| `GRAPHQL` | A **Custom Webhook** GraphQL query matches new onchain data | Arbitrary contract/event monitoring, DeFi triggers |

> `GRAPHQL` is the `type` value for **Custom Webhooks** (defined with a GraphQL query in the dashboard).

## Event Payload Structure

Alchemy's current (V2) payload shares a common envelope across every type:

```json
{
  "webhookId": "wh_octjglnywaupz6th",
  "id": "whevt_ogrc8v0jbfxk7bpc",
  "createdAt": "2024-05-01T12:34:56.000Z",
  "type": "ADDRESS_ACTIVITY",
  "event": {
    "network": "ETH_MAINNET",
    "activity": [
      {
        "fromAddress": "0xd6b8b7...",
        "toAddress": "0x53f4f4...",
        "blockNum": "0x123abc",
        "hash": "0x8c2f...",
        "value": 1.24,
        "asset": "ETH",
        "category": "external"
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `webhookId` | ID of the webhook configuration that produced this delivery |
| `id` | Unique event ID — **use this for idempotency / deduplication** |
| `createdAt` | ISO-8601 timestamp of when the event was generated |
| `type` | One of the event types above |
| `event` | Type-specific payload (`activity`, `transaction`, metadata, or GraphQL `data`) |

The shape of `event` varies by `type`:

- **`ADDRESS_ACTIVITY` / `NFT_ACTIVITY`** — `event.network` + `event.activity[]` (array of transfers).
- **`MINED_TRANSACTION` / `DROPPED_TRANSACTION`** — `event.network` + `event.transaction` (single tx object).
- **`NFT_METADATA_UPDATE`** — `event.network`, `event.contractAddress`, `event.tokenId`, metadata fields.
- **`GRAPHQL`** — `event.data` containing the result of your Custom Webhook GraphQL query.

## Delivery, Retries, and Security

- **Signature:** every delivery includes an `X-Alchemy-Signature` header (HMAC-SHA256 hex of the raw
  body). See [verification.md](verification.md).
- **Retries:** failed deliveries are retried with exponential backoff up to ~10 minutes (Free / Pay-As-You-Go)
  or ~1 hour (Enterprise). Return a `2xx` quickly to acknowledge receipt.
- **IP allowlist (optional):** Alchemy delivers from `54.236.136.17` and `34.237.24.169`.

## Full Event Reference

For the complete list of webhook types and payload schemas, see the
[Alchemy Webhooks documentation](https://www.alchemy.com/docs/reference/webhooks-overview).
