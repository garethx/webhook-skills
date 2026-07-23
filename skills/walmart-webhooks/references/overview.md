# Walmart Webhooks Overview

## What Are Walmart Webhooks?

Walmart Marketplace uses **performance webhooks** (also called push notifications) to alert your application in near real-time when events occur in your seller account — such as a new purchase order, an item going out of stock, an offer being published, a Buy Box change, or a return being created. Instead of polling the Marketplace APIs, Walmart sends an HTTP POST to the endpoint you register through the Webhooks Subscription API.

Each delivery is signed with HMAC-SHA256 so you can verify it genuinely came from Walmart (see [verification.md](verification.md)).

## Common Event Types

Every delivery carries an `eventType`, a `resourceName`, and an `eventVersion` (currently `V1`). You subscribe to specific event types via the Webhooks Subscription API.

> **Confirm these names for your account before subscribing.** Only the four rows marked ✅ (`PO_CREATED`, `INVENTORY_OOS`, `BUY_BOX_CHANGED`, `RETURN_CREATED`) were verified verbatim from Walmart's [Get event types](https://developer.walmart.com/us-marketplace/docs/get-event-types) API. The unmarked rows — including their `resourceName` mappings — are **illustrative** and were not confirmed. Available event types also vary by account and program, so call Get event types and use exactly what it returns.

| eventType | resourceName | Triggered When | Common Use Cases |
|-----------|--------------|----------------|------------------|
| ✅ `PO_CREATED` | `ORDER` | A new purchase order is routed to you | Reserve inventory, acknowledge order, start pick/pack/ship |
| `PO_LINE_AUTOCANCELLED` | `ORDER` | A PO line is automatically cancelled | Release inventory, update OMS |
| `INTENT_TO_CANCEL` | `ORDER` | A customer requests to cancel an order | Halt fulfillment if not yet shipped |
| `DRIVER_STATUS` | `ORDER` | Delivery driver status changes | Update delivery tracking |
| ✅ `INVENTORY_OOS` | `INVENTORY` | An item reaches out of stock | Trigger replenishment, pause ads |
| `OFFER_PUBLISHED` | `ITEM` | An offer becomes published/live | Enable listing in your catalog |
| `OFFER_UNPUBLISHED` | `ITEM` | An offer is unpublished | Investigate suppression, notify ops |
| ✅ `BUY_BOX_CHANGED` | `PRICE` | Buy Box ownership or price changes | Reprice, alert pricing team |
| ✅ `RETURN_CREATED` | `ReturnsAndRefunds` | A customer creates a return | Start returns workflow |
| `RETURN_DELIVERED` | `ReturnsAndRefunds` | A return is delivered back | Inspect and restock |
| `RETURN_INVOICED` | `ReturnsAndRefunds` | A return is invoiced | Reconcile refund |
| `REPORT_STATUS` | `REPORTS` | A requested report is ready | Download and ingest the report |
| `SELLER_PERFORMANCE_ALARMS` | `ITEMS` | A seller performance alarm fires | Alert account team |
| `SELLER_PERFORMANCE_REPORT` | `ITEMS` | A performance report is available | Ingest performance metrics |

## Event Payload Structure

Walmart delivers a JSON body. The exact schema varies by event type, but deliveries commonly include the event metadata and a resource reference:

```json
{
  "eventType": "PO_CREATED",
  "resourceName": "ORDER",
  "eventVersion": "V1",
  "eventTime": 1717000000,
  "sellerId": "1234567890",
  "resource": {
    "purchaseOrderId": "1234567890123"
  }
}
```

> Always confirm the `sellerId` in the payload is a seller you are authorized to process before acting on the event.

## Delivery Headers

| Header | Description |
|--------|-------------|
| `WM_SEC.TIMESTAMP` | Unix epoch **seconds** when the event was created (used in the signature and for replay checks) |
| `WM_SEC.SIGNATURE` | Base64-encoded HMAC-SHA256 signature |
| `WM_SEC.KEY_ID` | Optional — identifies the active secret during rotation |

Header names are matched **case-insensitively** (most frameworks lowercase them to `wm_sec.timestamp`, etc.).

## Retries & Timeouts

- Respond with a `2xx` status within **3 seconds**. Do the durable write first, then acknowledge.
- Repeated endpoint failures trigger a **webhook failure notification email** to your account administrators.
- The separate Walmart **event notifications** subscription flow (where Walmart authenticates itself to your endpoint via Basic Auth / HMAC / OAuth credentials **you** configure, rather than signing the payload) retries on a `5 min → 15 min → 45 min` schedule.

## Full Event Reference

For the complete, current list of event types, call the [Get event types](https://developer.walmart.com/us-marketplace/docs/get-event-types) API. See also the [Notifications overview](https://developer.walmart.com/us-marketplace/docs/notifications-overview).
