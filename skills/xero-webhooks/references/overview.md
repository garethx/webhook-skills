# Xero Webhooks Overview

## What Are Xero Webhooks?

Xero webhooks notify your application when data changes in a connected Xero organisation, so you don't have to poll the API. When a subscribed resource is created or updated, Xero POSTs a small JSON payload to your endpoint. The payload is **thin**: it tells you *which* resource changed (a `resourceId` and a `resourceUrl`), not the record's full contents. You then call the `resourceUrl` with an authenticated request to fetch the current state.

Webhooks are configured **per app** in the [Xero developer portal](https://developer.xero.com/app/manage), and a single app can receive events across every organisation that has connected to it.

## Common Event Types

Each event has an `eventCategory` and an `eventType`. Together they describe what happened — conventionally written as `CATEGORY/TYPE`, e.g. `CONTACT/CREATE` or `INVOICE/UPDATE`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `CONTACT/CREATE` | A new contact is added | Sync new customers/suppliers into a CRM |
| `CONTACT/UPDATE` | An existing contact changes | Keep contact details in sync |
| `INVOICE/CREATE` | A new invoice (ACCREC or ACCPAY) is raised | Trigger fulfilment, record receivables/payables |
| `INVOICE/UPDATE` | An invoice changes (e.g. paid, voided, edited) | Reconcile payments, update order status |
| `CREDITNOTE/CREATE` | A new credit note is created | Track refunds and adjustments |
| `CREDITNOTE/UPDATE` | A credit note changes | Update refund/adjustment records |
| `SUBSCRIPTION/CREATE` | An app-store subscription starts (app partners) | Provision access on new subscription |
| `SUBSCRIPTION/UPDATE` | An app-store subscription changes | Handle upgrades, cancellations, renewals |

- **`eventCategory`** enum: `CONTACT`, `INVOICE`, `CREDITNOTE`, `SUBSCRIPTION`
- **`eventType`** enum: `CREATE`, `UPDATE`

Available categories depend on the subscriptions enabled for your app in the developer portal.

## Event Payload Structure

The body is a JSON object with an `events` array plus sequencing/validation fields:

```json
{
  "events": [
    {
      "resourceUrl": "https://api.xero.com/api.xro/2.0/Contacts/e0c7a2d1-...",
      "resourceId": "e0c7a2d1-...",
      "eventDateUtc": "2024-05-01T12:00:00.000",
      "eventType": "CREATE",
      "eventCategory": "CONTACT",
      "tenantId": "b1a2c3d4-...",
      "tenantType": "ORGANISATION"
    }
  ],
  "firstEventSequence": 1,
  "lastEventSequence": 1,
  "entropy": "S0m3R4nd0mStr1ng"
}
```

**Top-level fields:**

| Field | Type | Description |
|-------|------|-------------|
| `events` | array | The events that occurred (may contain more than one) |
| `firstEventSequence` | integer | Sequence number of the first event in the list |
| `lastEventSequence` | integer | Sequence number of the last event in the list |
| `entropy` | string | Random string used to keep the signature payload unpredictable |

**Each event object:**

| Field | Type | Description |
|-------|------|-------------|
| `resourceUrl` | string (URI) | Authenticated URL to fetch the changed resource |
| `resourceId` | string (UUID) | ID of the changed resource (e.g. ContactID, InvoiceID) |
| `eventDateUtc` | string (date-time) | When the event occurred (UTC) |
| `eventType` | enum | `CREATE` or `UPDATE` |
| `eventCategory` | enum | `CONTACT`, `INVOICE`, `CREDITNOTE`, `SUBSCRIPTION` |
| `tenantId` | string (UUID) | The organisation the event relates to (use as `Xero-tenant-id`) |
| `tenantType` | enum | `ORGANISATION` or `APPLICATION` |

## Batching, Ordering, and Retries

- **Batching:** Under load Xero may package multiple events into one delivery, so always iterate the whole `events` array.
- **Retries:** If your endpoint doesn't return a timely `200`, Xero retries with exponential backoff. The same event can therefore arrive more than once — process **idempotently** by deduping on `resourceId` + `eventDateUtc`.
- **Fetch to confirm:** Because payloads are thin, always fetch the resource from `resourceUrl` to get the authoritative current state. Use the `tenantId` from the event as the `Xero-tenant-id` header on that request.

## Fetching the Changed Resource

The payload only points at the record. To read it, call `resourceUrl` with a valid OAuth2 access token for the tenant:

```
GET {resourceUrl}
Authorization: Bearer {access_token}
Xero-tenant-id: {tenantId}
Accept: application/json
```

The official SDKs help here: [`xero-node`](https://github.com/XeroAPI/xero-node) (Node.js) and [`xero-python`](https://github.com/XeroAPI/xero-python) (Python) wrap the Accounting API and OAuth2 token management. Note they do **not** provide a webhook-signature helper — verify signatures manually (see [verification.md](verification.md)).

## Full Event Reference

For the complete, authoritative list, see [Xero's webhook documentation](https://developer.xero.com/documentation/guides/webhooks/overview/).
