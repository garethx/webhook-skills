# Ascend Webhooks Overview

## What Are Ascend Webhooks?

[Ascend](https://www.useascend.com/) is an insurance payments and premium
financing platform. Webhooks let Ascend notify your application in real time
when something happens — for example when an invoice is paid — instead of your
app polling the API.

When an event occurs, Ascend sends an HTTP `POST` request over HTTPS to the
endpoint URL you registered. The request body is a JSON payload describing the
event, and it is signed with an HMAC-SHA256 signature (see
[verification.md](verification.md)). Your endpoint should verify the signature,
process the event, and return **HTTP 200** to acknowledge receipt.

## Event Payload Structure

Every webhook payload has the same top-level shape:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for this event |
| `type` | string | The event name, e.g. `invoice.paid` — branch on this |
| `data` | object | The resource the event is about (the invoice, payout, etc.) |

> **Note:** `data` is the resource object itself. Unlike Stripe, there is no
> `data.object` wrapper — access fields directly as `event.data.<field>`.

### Example: `invoice.paid`

```json
{
  "id": "ajskljfaklsjd0912132",
  "type": "invoice.paid",
  "data": {
    "id": "684c8c8e-75eb-4134-925a-cb3a30f23633",
    "memo": "Policy(s): I13123 (General Liability)",
    "payee": "John Doe Trucking",
    "status": "paid",
    "paid_at": "2023-10-01T23:51:37.507Z",
    "due_date": "2023-10-01",
    "issued_at": "2023-09-30T23:51:34.760Z",
    "insured_id": "700166b3-860d-40e0-8649-bb806e38acgh",
    "payer_name": "John Doe",
    "program_id": "5f77e68e-5649-4d14-8f5d-7d95bacb2323",
    "invoice_url": "https://",
    "invoice_items": [
      {
        "id": "ad26827a-5104-41c4-932a-d7cda47a5bf0",
        "title": "Paid in full for P8045172324",
        "amount_cents": 60,
        "invoice_item_type": "pay_in_full"
      }
    ],
    "invoice_number": "II2DH1HGHJ",
    "payment_method": {
      "card": { "brand": "visa", "last_four_digits": "4256" },
      "payment_type": "card"
    },
    "total_amount_cents": 600000
  }
}
```

## Common Event Types

Ascend groups webhook events into three categories: invoice, payout, and refund.

### Invoice events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `invoice.created` | An invoice is created | Create a local billing record, notify the payer |
| `invoice.processing_payment` | An invoice payment is being processed | Show a pending state, avoid duplicate charges |
| `invoice.paid` | An invoice is paid | Record payment, update billing history, unlock coverage |
| `invoice.voided` | An invoice is voided | Reverse the local billing record |
| `invoice.marked_overdue` | An invoice is marked overdue | Trigger dunning, notify the payer |

### Payout events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payout.paying` | A payout is being paid out | Show a pending payout state |
| `payout.paid` | A payout has been paid | Reconcile payouts, update accounting ledger |
| `payout.on_hold` | A payout is placed on hold | Flag for review, notify finance |
| `payout.canceled` | A payout is canceled | Reverse the pending ledger entry |
| `payout.failed` | A payout failed | Alert, retry, or reconcile |

### Refund events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `refund.paid` | A refund has been paid | Update policy/billing records, notify the customer |
| `refund.cancelled` | A refund was cancelled | Reverse the pending refund record |

**Always branch on the `type` field** and treat unknown types gracefully so new
event types Ascend adds later don't break your handler.

## Delivery Expectations

- Endpoints must respond with **HTTP 200** to acknowledge receipt.
- Ascend's retry behavior and signature timestamp tolerance are **not
  documented**. Design your handler to be idempotent (dedupe on the event `id`)
  so repeated deliveries are safe.

## Full Event Reference

For the authoritative and latest details, see
[Ascend's webhook documentation](https://developers.useascend.com/docs/webhooks).
