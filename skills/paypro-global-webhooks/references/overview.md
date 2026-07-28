# PayPro Global IPN Webhooks Overview

## What Are PayPro Global Webhooks?

PayPro Global is a merchant-of-record billing platform. It notifies your
application of order and subscription events through **IPN** (*Instant Payment
Notification*) webhooks.

Key characteristics:

- **Transport:** HTTP `POST` over HTTPS.
- **Content-Type:** `application/x-www-form-urlencoded` — the body is
  **form-encoded key/value pairs, not JSON**.
- **Event field:** the event name is in the **`IPN_TYPE_NAME`** field.
- **Verification:** three independent layers — an IP allowlist, a `SIGNATURE`
  (SHA256) parameter, and a `HASH` (MD5) parameter. See
  [verification.md](verification.md).
- **Retries:** if your endpoint does not return HTTP `200`, PayPro Global retries
  the call **every 30 minutes for a maximum of 3 attempts**.
- **No official SDK:** PayPro Global publishes no npm/pip SDK. (The `paypro`
  packages on npm/PyPI belong to **PayPro B.V. / paypro.nl**, an unrelated Dutch
  company — do not use them.)

## Common Event Types

The event name is delivered in the **`IPN_TYPE_NAME`** field. Note the
non-standard spelling of `SubscriptionChargeSucceed` (not "Succeeded").

### Order events

| `IPN_TYPE_NAME` | Triggered When | Common Use Cases |
|-----------------|----------------|------------------|
| `OrderCharged` | An order (or first subscription charge) is paid | Fulfil, grant access, deliver license |
| `OrderRefunded` | An order is fully refunded | Revoke access, adjust accounting |
| `OrderPartiallyRefunded` | An order is partially refunded | Adjust balance, partial revoke |
| `OrderChargedBack` | A chargeback is opened | Suspend account, gather evidence |
| `OrderChargedBackWon` | A chargeback dispute is won | Restore access |
| `OrderDeclined` | A payment attempt is declined | Notify customer, retry flow |
| `OrderOnWaiting` | An order is pending/on hold | Await resolution before fulfilling |
| `OrderCustomerInformationChanged` | Customer info on an order changes | Sync CRM/records |

### Subscription events

| `IPN_TYPE_NAME` | Triggered When | Common Use Cases |
|-----------------|----------------|------------------|
| `SubscriptionChargeSucceed` | A recurring charge succeeds | Extend subscription period |
| `SubscriptionChargeFailed` | A recurring charge fails | Dunning, notify customer |
| `SubscriptionRenewed` | A subscription renews | Extend access |
| `SubscriptionSuspended` | A subscription is suspended | Pause access |
| `SubscriptionTerminated` | A subscription is terminated | Revoke access |
| `SubscriptionFinished` | A subscription reaches its natural end | Offer renewal |
| `SubscriptionPaymentInfoChanged` | Payment method on a subscription changes | Update stored state |
| `TrialCharge` | A trial charge occurs | Track trial conversions |

### Other events

| `IPN_TYPE_NAME` | Triggered When | Common Use Cases |
|-----------------|----------------|------------------|
| `LicenseRequested` | A license key is requested (External License Generator) | Generate and return a license key |
| `InstantLeadNotification` | A lead is captured | Sync lead to CRM |

## Event Payload Structure

The body is form-encoded. Common fields used for verification and handling:

| Field | Description |
|-------|-------------|
| `IPN_TYPE_NAME` | Event name (e.g. `OrderCharged`) |
| `ORDER_ID` | PayPro Global order id |
| `ORDER_STATUS` | Order status (e.g. `Processed`, `Refunded`) |
| `ORDER_TOTAL_AMOUNT` | Order total (e.g. `9.99`) |
| `CUSTOMER_EMAIL` | Customer email address |
| `TEST_MODE` | `1` for test orders, `0` for live orders |
| `SIGNATURE` | SHA256 verification hash (see [verification.md](verification.md)) |
| `HASH` | MD5 verification hash (see [verification.md](verification.md)) |

> **Test orders:** when `TEST_MODE` is `1`, transaction-related amounts arrive as
> `0`, and the `HASH` is `MD5("1")` rather than `MD5(ORDER_ID + SecretKey)`.

Additional product, customer, and subscription fields are included depending on
the event and your store configuration.

## Full Event Reference

For the complete, authoritative list of IPN events and fields, see PayPro
Global's [Webhook (IPN) documentation](https://developers.payproglobal.com/docs/integrate-with-paypro-global/webhook-ipn/).
