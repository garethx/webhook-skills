# ShipStation Webhooks Overview

## What Are ShipStation Webhooks?

ShipStation webhooks (V1 API, `ssapi.shipstation.com`) notify your application when orders are
imported or shipped. Unlike most webhook providers, ShipStation V1 sends a **thin payload** — it does
**not** include the order or shipment data. Instead it POSTs a small JSON body containing a
`resource_url` you must fetch back (with Basic auth) plus a `resource_type` telling you what happened.

```json
{
  "resource_url": "https://ssapi.shipstation.com/orders?importBatch=abc-123&storeID=98765",
  "resource_type": "ORDER_NOTIFY"
}
```

You then `GET` the `resource_url` using HTTP Basic auth (your API key as the username, API secret as
the password) to retrieve the actual data. This authenticated fetch-back is the core of the trust
model, because V1 provides **no signature** to verify.

## Common Event Types

ShipStation V1 supports exactly **six** webhook events. The value you subscribe to is echoed back as
the `resource_type` field on every delivery:

| Event (`resource_type`) | Triggered When | Common Use Cases |
|-------------------------|----------------|------------------|
| `ORDER_NOTIFY` | A new order is imported into ShipStation | Sync orders into your OMS/ERP, notify ops |
| `ITEM_ORDER_NOTIFY` | A new order is imported (item-level notification) | Reconcile line items, inventory allocation |
| `SHIP_NOTIFY` | An order is marked shipped / a label is created | Send tracking emails, mark orders fulfilled |
| `ITEM_SHIP_NOTIFY` | An order is shipped (item-level notification) | Per-item fulfillment updates, partial shipments |
| `FULFILLMENT_SHIPPED` | An external fulfillment is marked shipped | Update marketplace/3PL fulfillment status |
| `FULFILLMENT_REJECTED` | An external fulfillment is rejected | Handle rejected fulfillments, alert ops |

There are no other V1 event types.

## Event Payload Structure

Every V1 webhook body has the same two fields:

| Field | Description |
|-------|-------------|
| `resource_url` | The `ssapi.shipstation.com` URL to `GET` (with Basic auth) for the real data |
| `resource_type` | One of the six event strings above |

Some deliveries also include a `resource_type`-specific batch or store identifier inside the
`resource_url` query string. Always fetch the URL rather than parsing the webhook body for data.

### Fetching the resource

- Authenticate with **HTTP Basic auth**: `Authorization: Basic base64(API_KEY:API_SECRET)`.
- The V1 API is rate limited to **40 requests/minute per key**. On `429`, read the
  `X-Rate-Limit-Reset` response header (seconds until the window resets) and back off.
- Only fetch `ssapi.shipstation.com` URLs — validate the host before requesting (SSRF guard).

## Retry Behavior

ShipStation V1 retry behavior is **not documented**. Treat deliveries as at-least-once: make your
handler **idempotent** (e.g. dedupe on the fetched resource's order/shipment ID) so a resent webhook
does not double-process.

## ShipStation API V2 (ShipEngine) — Different Product

The newer **ShipStation API V2** (`api.shipstation.com/v2`, docs.shipstation.com) is built on
ShipEngine and is unrelated to the V1 events above. It sends **full payloads**, uses different event
types (`batch`, `track`, `rate`, `report_complete`, `carrier_connected`, …), and signs deliveries
with **RSA-SHA256** headers. This skill targets **V1**; see
[verification.md](verification.md) for a short V2 outline.

## Full Event Reference

For the complete list of events and payloads, see the
[ShipStation Webhooks documentation](https://help.shipstation.com/hc/en-us/articles/360025856252-ShipStation-Webhooks).
