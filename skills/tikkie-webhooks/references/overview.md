# Tikkie Notifications Overview

## What they are

The Tikkie API v2 (2.3.x) lets a business create payment requests ("Tikkies").
Once you set up a notification subscription, Tikkie sends an HTTP `POST` to your
URL in two cases:

- **A payment** is made on one of your payment requests, or **a refund** is executed.
  This comes from the payment-request subscription.
- **A transaction bundle** is paid out, which means bundled payout files are
  available. This comes from the transactions subscription.

The two subscriptions are independent. Each has its own `subscriptionId`, its
own permission on the app token, and its own `POST`/`DELETE` endpoint. See
[setup.md](setup.md).

This is not ABN AMRO's Business Account Notification API (bank-account
transaction webhooks), and it's not the retired Tikkie v1 API.

## Notification types

The discriminator is the `notificationType` **body field**. There's no
event-type header. Its enum is exactly `PAYMENT | REFUND | BUNDLE`.

| `notificationType` | Required fields | Meaning |
|---|---|---|
| `PAYMENT` | `subscriptionId`, `notificationType`, `paymentRequestToken`, `paymentToken` | A payment was made on a payment request |
| `REFUND` | `subscriptionId`, `notificationType`, `paymentRequestToken`, `paymentToken`, `refundToken` | A refund on a payment was executed |
| `BUNDLE` | `subscriptionId`, `notificationType`, `bundleId` | A transaction bundle is available |

### Example payloads (verbatim from the OpenAPI spec)

```json
{
  "subscriptionId": "6289db02-d422-4e93-b65c-30fa973bd341",
  "notificationType": "PAYMENT",
  "paymentRequestToken": "qzdnzr8hnVWTgXXcFRLUMc",
  "paymentToken": "21ef7413-cc3c-4c80-9272-6710fada28e4"
}
```

```json
{
  "subscriptionId": "6289db02-d422-4e93-b65c-30fa973bd341",
  "notificationType": "REFUND",
  "paymentRequestToken": "qzdnzr8hnVWTgXXcFRLUMc",
  "paymentToken": "21ef7413-cc3c-4c80-9272-6710fada28e4",
  "refundToken": "abcdzr8hnVWTgXXcFRLUMc"
}
```

```json
{
  "subscriptionId": "5505d055-89e9-48b7-913d-8414d9f8d3cd",
  "notificationType": "BUNDLE",
  "bundleId": "af8fa035-3275-44fc-9a9b-a38c02efa114"
}
```

A notification carries **only tokens**. It has no amount, status, timestamp,
event id or anything else. Don't read those from the notification, and don't
invent them.

## The records you fetch

To get the facts, re-fetch from the Tikkie API with `API-Key` + `X-App-Token`:

| Type | Endpoint | Object |
|---|---|---|
| `PAYMENT` | `GET /paymentrequests/{paymentRequestToken}/payments/{paymentToken}` | **Payment**: `paymentToken`, `tikkieId`, `counterPartyName`, `counterPartyAccountNumber`, `amountInCents`, `description`, `createdDateTime`, `refunds[]` |
| `REFUND` | `GET /paymentrequests/{paymentRequestToken}/payments/{paymentToken}/refunds/{refundToken}` | **Refund**: `refundToken`, `amountInCents`, `description`, `referenceId`, `createdDateTime`, `status` (`PENDING` \| `PAID`) |
| `BUNDLE` | `GET /transactionbundles/{bundleId}` | The transaction bundle |

## Delivery semantics

- `POST`, `Content-Type: application/json`. Any `2XX` acknowledges the
  notification. The spec describes it as "Acknowledgement that a notification is received."
- Retries are best effort. Quoting the spec: "best-effort approach ... retry
  mechanism with a maximum of three attempts. However, you should not rely
  solely on notifications and are encouraged to have a GET implemented".
  - Because retries can duplicate deliveries, make the handler idempotent.
    Deduplicate on `paymentToken`, `refundToken` or `bundleId`.
  - Because notifications can be lost, add a reconciliation job that polls
    your open payment requests with the Tikkie API's GET endpoints.
- The spec documents no timeout and no ordering guarantee. Acknowledge quickly.
- Unknown `notificationType` values or extra fields: log them and return `2xx`.
  Don't fail, or Tikkie will retry.
