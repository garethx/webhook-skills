# Bridge (bridge.xyz) Webhooks Overview

## What Are Bridge Webhooks?

[Bridge](https://bridge.xyz) is a stablecoin orchestration platform for moving
money between fiat and stablecoins (customers/KYC, transfers, virtual accounts,
liquidation addresses, and cards). Bridge webhooks notify your application when
resources change — for example when a customer completes KYC, a transfer settles,
or funds land in a virtual account — so you don't have to poll the API.

Each event is delivered as an HTTP `POST` with a JSON body and an
`X-Webhook-Signature` header signed with **RSA-SHA256**. You verify the signature
using the **per-endpoint public key** returned by the webhook API (see
[verification.md](verification.md)).

## How Subscription Works

Bridge subscriptions are **category-based**, not per-event. When you create a
webhook you pass an `event_categories` array (e.g. `["customer", "kyc_link",
"transfer"]`). You then receive every `<category>.<action>` event within those
categories. New webhooks are created **disabled** and must be enabled before
events are delivered — see [setup.md](setup.md).

## Event Categories

| Category | Example events | Fires when |
|----------|----------------|------------|
| `customer` | `customer.created`, `customer.updated` | A customer record or its KYC/verification status changes |
| `kyc_link` | `kyc_link.updated` | A hosted KYC / Terms-of-Service link changes status |
| `transfer` | `transfer.created`, `transfer.updated` | A transfer is created or changes status (e.g. payment processed, returned) |
| `virtual_account` | `virtual_account.activity` | Funds are received or processed on a virtual account |
| `liquidation_address` | `liquidation_address.*` | Activity on a liquidation (drain) address |
| `card_account` | `card_account.*` | A card account changes |
| `card_transaction` | `card_transaction.*` | A card transaction occurs |
| `static_memo` | `static_memo.*` | Static memo deposit activity |

Event names always follow the `<category>.<action>` pattern. The most commonly
handled events are:

| Event | Common Use Cases |
|-------|------------------|
| `customer.created` | Provision an account, start onboarding |
| `customer.updated` | React to KYC approval/rejection, update customer state |
| `kyc_link.updated` | Track KYC/ToS completion, unblock onboarding steps |
| `transfer.created` | Record a new payment/payout in your ledger |
| `transfer.updated` | Update payment status, trigger fulfillment on settlement |
| `virtual_account.activity` | Reconcile incoming funds, credit a balance |

## Event Payload Structure

Bridge event payloads are JSON. Fields vary by category, but events commonly
include an event identifier, the event type/category, a timestamp, and the
affected resource object. A representative shape:

```json
{
  "api_version": "2024-01-01",
  "event_id": "evt_00000000000000000000000000",
  "event_category": "customer",
  "event_type": "customer.updated",
  "event_object_id": "cust_00000000000000000000000000",
  "event_created_at": "2026-01-01T00:00:00.000Z",
  "event_object": {
    "id": "cust_00000000000000000000000000",
    "status": "active"
  }
}
```

Always treat the exact field names as authoritative from the Bridge API and the
resource you subscribed to; branch your handler on the event type string
(e.g. `event_type` / `event_category`) and access the nested resource object.

## Delivery, Retries, and Replay Protection

- Return a **2xx quickly** (ideally within a couple of seconds) to acknowledge receipt.
- On any verification/processing failure, return a **non-2xx (Bridge's docs use 400)** to trigger Bridge's automatic retries.
- Reject events whose signature timestamp is **older than ~10 minutes** to guard against replay attacks.

## Full Event Reference

For the complete list of categories, events, and payload fields, see Bridge's
official documentation:

- [Setting up webhooks](https://apidocs.bridge.xyz/get-started/introduction/quick-start/setting-up-webhooks)
- [Webhook signature verification](https://apidocs.bridge.xyz/platform/additional-information/webhooks/signature)
