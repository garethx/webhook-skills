# Exact Online Webhooks Overview

## What Are Exact Online Webhooks?

Exact Online webhooks notify your application when data changes inside a
**division** (a company administration). Instead of polling the REST API, you
**subscribe to a topic** and Exact Online sends an HTTP POST to your callback URL
whenever a matching entity is created, updated, or deleted.

Exact Online webhooks are unusual in two ways:

1. **The signature is inside the JSON body, not an HTTP header.** The body is
   `{"Content":{…},"HashCode":"<hex>"}`. `HashCode` is an HMAC-SHA256 of the
   `Content` node. Exact does **not** use the Standard Webhooks spec.
2. **The payload is thin.** It tells you *what* changed (topic, action, entity
   GUID, division) but not the *record itself*. You fetch the full record from
   the REST API using the `Key` (GUID) and `Division`.

## Event Payload Structure

Every delivery has the same envelope:

```json
{
  "Content": {
    "Topic": "Accounts",
    "Action": "Update",
    "Key": "d4d4c8b6-1a2b-4c3d-9e8f-1234567890ab",
    "Division": 123456,
    "ClientId": "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d"
  },
  "HashCode": "5A3F9C2E7B1D8A46F0C3E9B2D7A15C8E4F6091A2B3C4D5E6F7089ABCDEF01234"
}
```

| Field | Meaning |
|-------|---------|
| `Content.Topic` | The subscribed topic (e.g. `Accounts`, `Items`) |
| `Content.Action` | `Create`, `Update`, or `Delete` |
| `Content.Key` | GUID of the changed entity — use it to fetch the full record |
| `Content.Division` | The division (company) the change belongs to |
| `Content.ClientId` | Your app's client id |
| `HashCode` | Uppercase hex HMAC-SHA256 of the raw `Content` JSON (the signature) |

`GoodsDeliveries` deliveries can additionally arrive near-instantly when the
subscription is created with the `IsInstant` flag.

## Common Topics

`Action` is always one of `Create`, `Update`, or `Delete`.

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Accounts` | A customer/supplier account changes | CRM sync, dedupe |
| `Items` | A product/item changes | Catalog & price sync |
| `StockPositions` | An item's stock position changes | Inventory sync, reorder alerts |
| `FinancialTransactions` | A financial transaction is booked/changed | Reconciliation, reporting |
| `GoodsDeliveries` | A goods delivery is created/updated | Fulfilment, shipping |
| `Contacts` | A contact person changes | CRM sync |

Exact Online documents around 30 topics (e.g. `SalesInvoices`, `PurchaseOrders`,
`Subscriptions`, `Documents`, `TransactionLines`, and more). The set of available
topics can change; the authoritative list is returned by the API and documented
by Exact.

## The Fetch-to-Enrich Pattern

Because the payload only tells you *that* something changed, act like this:

1. **Verify** the `HashCode` against the raw `Content` JSON.
2. **Read** `Topic`, `Action`, `Key`, `Division` from `Content`.
3. **Fetch** the full record from the REST API (skip on `Delete`):

   ```
   GET /api/v1/{Division}/crm/Accounts?$filter=ID eq guid'{Key}'
   Authorization: Bearer {oauth2_access_token}
   Accept: application/json
   ```

4. **Act** on the record and **return 200** quickly. Exact retries non-2xx
   responses, so do slow work asynchronously.

Each topic maps to a specific REST endpoint (e.g. `Accounts` → `crm/Accounts`,
`Items` → `logistics/Items`). Look up the endpoint for your topic in the Exact
REST API reference.

## Full Event Reference

- [Exact Online Webhooks documentation](https://support.exactonline.com/community/s/article/All-All-DNO-Content-webhooksc?language=en_GB)
- [Exact Online REST API reference](https://start.exactonline.nl/docs/HlpRestAPIResources.aspx)
