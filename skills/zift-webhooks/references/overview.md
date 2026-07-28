# Zift Webhooks Overview

## What Are Zift Webhooks?

Zift (a payments platform / gateway) delivers **notifications** to an HTTPS
endpoint you register with Zift support. Each notification is an **HTTPS POST
with a JSON body** describing a billing or processing event (a subscription was
created, a chargeback arrived, an ACH return occurred, etc.).

Two things make Zift notifications different from most webhook providers:

1. **No signature to verify.** There is no HMAC, no `X-Zift-Signature` header,
   and no Basic/token auth on the delivery. Authenticity relies on HTTPS +
   endpoint-URL secrecy, optionally reinforced with IP allowlisting.
2. **You acknowledge by echoing the id.** To confirm receipt your endpoint must
   return a JSON body containing the notification's `notificationId`. That
   response *is* the acknowledgement — see
   [verification.md](verification.md). Failing to ack triggers retries.

## Event Payload Structure

Every notification uses the same envelope:

```json
{
  "notificationId": 272638,
  "eventCode": "billing.subscription-created",
  "eventDate": 1753670400000,
  "dataType": "subscription",
  "data": { }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `notificationId` | int or string | Unique delivery id. **Echo this back to acknowledge.** Zift accepts either an integer (`272638`) or a string (`"272638"`). |
| `eventCode` | string | Dotted event name, `category.entity-action`, e.g. `billing.subscription-created`. |
| `eventDate` | number | Event timestamp in **epoch milliseconds**. |
| `dataType` | string | Names the shape of `data` (e.g. `subscription`, `chargeback`). |
| `data` | object | The event-specific payload. |

## Event Categories

Notifications split into two families, carried in the `eventCode` prefix:

- **`billing.*`** — recurring-billing events (subscriptions, payment options,
  allocations, scheduled payments).
- **`processing.*`** — transaction/processing events (chargebacks, ACH returns,
  reversals, Notices of Change).

Dispatch on the prefix (`billing` / `processing`), then branch on the specific
`eventCode`. The prefix split is stable even if a specific suffix differs from
the table below.

## Common Event Types

Only `billing.subscription-created` is documented verbatim. The remaining
`eventCode` strings below are derived from Zift's **setup trigger names** using
the `category.entity-action` pattern — **confirm the exact literals with Zift
support at onboarding** before hard-coding equality checks. Dispatching on the
`billing` / `processing` prefix is robust regardless.

| Setup trigger name | Likely `eventCode` | Category | Triggered when |
|--------------------|--------------------|----------|----------------|
| `subscription~create` | `billing.subscription-created` | billing | A recurring subscription is created |
| `payment-option~create` | `billing.payment-option-created` | billing | A payment option (method) is added |
| `allocation~create` | `billing.allocation-created` | billing | A billing allocation is created |
| `payment~process` | `billing.payment-processed` | billing | A scheduled billing payment is processed |
| `chargeback` | `processing.chargeback` | processing | A chargeback is received |
| `return` | `processing.return` | processing | An ACH / eCheck return occurs |
| `reversal` | `processing.reversal` | processing | A transaction is reversed |
| `NOC` | `processing.noc` | processing | An ACH Notice of Change is received |

> **ACH detail.** `processing.return` and `processing.noc` carry ACH-specific
> detail — return reason codes, and (for NOC) token changes, routing-number
> updates, and account-type modifications.

## Retry Behaviour

If your endpoint does not acknowledge with the `notificationId`, Zift retries at:

1. **+5 minutes**
2. **+15 minutes**
3. **+60 minutes**
4. **+24 hours**

After the final attempt the notification is marked **`Failed`** and is **not**
redelivered. Because a retry may deliver an event you already processed, make
your handler idempotent (dedupe on `notificationId`).

## Full Event Reference

Zift's webhook behaviour is documented at
[api.zift.io](https://api.zift.io/#webhooks). Because the public docs do not
exhaustively enumerate every `eventCode`, confirm the precise event strings and
`data` shapes you will receive with Zift support during onboarding.
