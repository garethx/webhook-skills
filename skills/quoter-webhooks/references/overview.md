# Quoter Webhooks Overview

## What Are Quoter Webhooks?

Quoter is a sales quoting / CPQ platform. Webhooks let Quoter notify your application in real time when a **Quote**, **Person**, or **Payment** object is created or updated. When a subscribed object changes, Quoter sends an HTTP `POST` to the URL you configure under **Settings → Integrations**.

Unlike most modern webhook providers, Quoter:

- Sends payloads as **`application/x-www-form-urlencoded`**, not `application/json`.
- Puts the actual payload inside a form field named **`data`** (a JSON or XML **string**).
- Signs with a legacy **MD5 shared-secret hash** carried in a form field named **`hash`** — not an HTTP header, and not HMAC-SHA256.

## The Request Shape

Every delivery is a `POST` with a form body containing exactly three fields:

| Field | Description |
|-------|-------------|
| `hash` | `md5(HASH_KEY + timestamp + data)` — the verification hash (hex). Empty/absent if no hash key is configured. |
| `timestamp` | GMT UNIX timestamp (seconds) when Quoter sent the request. |
| `data` | The payload as a **string** — JSON or XML, depending on the format chosen at setup. |

## Object Types (No Event Names)

Quoter does **not** use dotted event names like `quote.published`, `quote.won`, or `quote.lost`. You subscribe an **object type** via the "Applies To" setting, and the webhook fires on **create or update** of that object.

| Object Type ("Applies To") | Triggered When | Common Use Cases |
|----------------------------|----------------|------------------|
| `Quote` | A quote is created or updated (including status changes) | Sync quotes to a CRM/ERP, trigger fulfillment when a quote is accepted/ordered |
| `Person` | A person/contact is created or updated | Keep contact records in sync, enrich CRM data |
| `Payment` | A payment is created or updated | Reconcile payments, update accounting, send receipts |

Because a single webhook URL is bound to one object type, you know which object type you're handling **from your endpoint configuration** — the object type is not sent in the payload or an HTTP header. Since Quoter lets you set the full target URL, add a hint your handler can read, e.g. `https://yourapp.com/webhooks/quoter?object=quote`. The examples in this skill dispatch on this `object` query parameter (`quote`, `person`, or `payment`).

### Create vs Update

Each object type fires on **both create and update** — Quoter's documentation does not define a separate event name or a documented field to tell them apart. Design your handler to be **idempotent** keyed on the record's `id` so re-processing the same object (or receiving the create and a later update) is safe. If you need to know whether a record is new, compare against your own store rather than relying on the payload.

## Event Payload Structure

After URL-decoding the form body, parse the `data` field as JSON (assuming JSON format was selected). The exact fields depend on the object type and your Quoter account; a Quote payload looks roughly like:

```json
{
  "id": "quot_abc123",
  "name": "Q-1042",
  "status": "pending"
}
```

Notes:

- Field names and available fields depend on the object type and your Quoter account. Treat the payload defensively — check for a field before using it.
- If you selected **XML** format at setup, `data` is an XML string; parse it with an XML parser instead of `JSON.parse`. Verification is identical — hash the `data` string exactly as received.

## Retry Behavior

Quoter's retry/redelivery behavior is **not documented**. Design your handler to be **idempotent** (safe to receive the same object update more than once) and return a `2xx` quickly. For guaranteed delivery, automatic retries, and replay, front your endpoint with [Hookdeck](https://hookdeck.com).

## Full Event Reference

See Quoter's official documentation: [Integrate with Webhooks](https://help.quoter.com/hc/en-us/articles/32085971955355-Integrate-with-Webhooks).
