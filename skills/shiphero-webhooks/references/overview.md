# ShipHero Webhooks Overview

## What Are ShipHero Webhooks?

ShipHero is a warehouse management and fulfillment platform. It uses webhooks to
send your application an asynchronous HTTP POST notification whenever a
fulfillment event occurs — an order is allocated, a shipment goes out, inventory
levels change, a purchase order is updated, and so on. Instead of polling the
GraphQL API, you register a webhook per event type and ShipHero pushes the data
to your endpoint.

Each ShipHero webhook is a **single event type**. You register one webhook per
type via the `webhook_create` GraphQL mutation, and each registration returns a
`shared_signature_secret` used to verify that type's deliveries.

## Common Webhook Types

ShipHero webhook type names are **Title Case strings**. The `name` you register
with `webhook_create` is the exact type string, and the same string appears as
the `webhook_type` field inside each payload — that field is how you dispatch,
since there is no topic header.

| Webhook Type | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `Order Allocated` | Inventory is allocated to an order | Trigger downstream fulfillment, notify customer |
| `Shipment Update` | An order ships (tracking, carrier, packages) | Send tracking emails, update order status |
| `Inventory Update` | On-hand / available inventory changes | Sync stock to storefront/ERP |
| `Order Canceled` | An order is canceled | Refunds, restock, notify systems |
| `PO Update` | A purchase order changes state | Track inbound inventory, receiving |
| `Return Update` | A return (RMA) is created or updated | Process refunds, restock returns |
| `Tote Complete` | A pick tote is completed | Track picking progress |
| `Package Added` | A package is added to a shipment | Update packing / carton records |

## Full Webhook Type List

The complete set of ShipHero webhook types:

- `Inventory Update`
- `Inventory Change`
- `Shipment Update`
- `Order Allocated`
- `Order Deallocated`
- `Order Canceled`
- `Order Packed Out`
- `PO Update`
- `Return Update`
- `Tote Complete`
- `Tote Cleared`
- `Package Added`
- `Capture Payment`
- `Generate Label`
- `Print Barcode`
- `Automation Rules`
- `Shipment ASN`
- `Work Order Status Update`

## Event Payload Structure

Every ShipHero webhook payload includes an `account_id`, an `account_uuid`, and
a `webhook_type` field identifying the event, plus event-specific fields. For
example, an `Inventory Update`:

```json
{
  "account_id": 63898,
  "account_uuid": "QWNjb3VudDo2Mzg5OA==",
  "webhook_type": "Inventory Update",
  "inventory": [
    {
      "sku": "SKU-123",
      "warehouse_id": 12345,
      "on_hand": 42,
      "available": 40
    }
  ]
}
```

## Delivery Headers

| Header | Description |
|--------|-------------|
| `x-shiphero-hmac-sha256` | Base64 HMAC-SHA256 signature of the raw body |
| `X-Shiphero-Message-ID` | Unique per-delivery id — use for deduplication |

## Delivery Behavior

- **Timeout**: ~10 seconds per call (20 seconds for `Generate Label`).
- **Retries**: up to 5 retries per trigger. There is no delivery SLA.
- **Disabled webhooks**: ShipHero does **not** queue events while a webhook is
  disabled — events fired during that window are discarded.
- **Expected response**: a `2xx` status with body `{"code": "200", "Status": "Success"}`.

## Full Event Reference

For the complete list of webhook types and payloads, see the
[ShipHero Webhooks documentation](https://developer.shiphero.com/webhooks/).
