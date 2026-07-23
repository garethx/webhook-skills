# Flexport Webhooks Overview

## What Are Flexport Webhooks?

Flexport webhooks notify your application about freight and logistics milestones
as they happen — a shipment is created, a leg departs or arrives, a container is
loaded, a document is generated, an invoice is paid. Instead of polling the
Flexport API, you register an HTTPS endpoint and Flexport POSTs a Flexport
**Event** object to it whenever a subscribed milestone occurs.

Each delivery is signed with an HMAC of the raw request body so you can verify it
came from Flexport. See [verification.md](verification.md).

## The Event Object

The webhook body is a Flexport **Event** object. Dispatch on the `type` field,
which is the milestone identifier in `/object#event` format (for example
`/shipment#created`) — **not** `object.event`. The affected object lives under
`data`.

| Field | Description |
|-------|-------------|
| `_object` | Object type marker (e.g. `/event`) |
| `id` | Unique event ID (use for idempotency/deduplication) |
| `version` | API version |
| `created_at` | When the event record was created |
| `occurred_at` | When the underlying milestone occurred |
| `type` | Milestone identifier, e.g. `/shipment_leg#departed` |
| `data` | Event data — typically `resource`, `shipment`, `location`, `containers`, `exception` |

Example:

```json
{
  "_object": "/event",
  "id": 987654,
  "version": 2,
  "created_at": "2026-07-23T10:00:00Z",
  "occurred_at": "2026-07-23T09:59:00Z",
  "type": "/shipment_leg#departed",
  "data": {
    "resource": { "_object": "/shipment_leg", "id": 42 },
    "shipment": { "_object": "/shipment", "id": 100 },
    "location": { "name": "Port of Shanghai" }
  }
}
```

## Common Event Types

> **Verify these names before relying on them.** Only `/shipment#created` and
> `/shipment_leg#departed` are confirmed against Flexport's milestone reference;
> the full milestone enum could not be read in full from Flexport's docs. The
> remaining rows are **illustrative** examples of the `/object#event` format, not
> a verified enum — confirm the exact identifiers against
> [Flexport's milestone reference](https://apidocs.flexport.com/v2/tag/Webhook-Endpoints/)
> or the events your account actually receives.

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `/shipment#created` | A shipment is created (quote confirmed) | Kick off internal order/shipment records |
| `/shipment#booking_confirmed` | Carrier booking is confirmed | Notify stakeholders, update ETAs |
| `/shipment#delivered_in_full` | Entire shipment is delivered | Close out orders, trigger billing |
| `/shipment_leg#departed` | A shipment leg departs its origin | Update in-transit status, notify customers |
| `/shipment_leg#arrived` | A shipment leg arrives at its destination | Trigger customs/last-mile workflows |
| `/document#document_created` | A document is uploaded/generated | Sync commercial invoices, BOLs, packing lists |
| `/invoice#invoice_payment_made` | An invoice payment is processed | Reconcile accounts payable |
| `/purchase_order#acknowledged` | A purchase order is acknowledged | Advance procurement workflows |

Flexport groups milestones into categories (transit, administrative, invoice,
document, purchase order, container load result, and others) — check the
milestone reference for the current category names and their contents. Some
milestones are **available upon request** and must be enabled by Flexport for
your account.

## Full Event Reference

For the complete list of milestones and the Event schema, see the
[Flexport Webhook Endpoints documentation](https://apidocs.flexport.com/v2/tag/Webhook-Endpoints/).

## Note: Logistics API is a separate product

Flexport also ships a newer **Logistics API** (`docs.logistics-api.flexport.com`)
with its own `POST /logistics/api/{version}/webhooks`, `Order.*`/`Shipment.*`
event names, and a different envelope. This skill targets the classic Flexport
v2 webhooks (the `/object#event` milestone model with `X-Hub-Signature-256`). If
you are on the Logistics API, verify its own signature scheme separately.
