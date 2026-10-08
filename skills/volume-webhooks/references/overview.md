# Volume Webhooks Overview

## What Are Volume Webhooks?

[Volume](https://getvolume.com) is a UK open banking, pay-by-bank payments
provider. Its API host is `volumepay.io`. When a payment reaches a **final**
status, Volume notifies your backend with a webhook:

- **Method:** HTTP `PUT`, not `POST`
- **URL:** the webhook URL set in your application configuration in the Volume merchant dashboard
- **Content-Type:** `application/json`
- **Signature:** `Authorization: SHA256withRSA <base64 signature>`, an RSA signature over the raw body (see [verification.md](verification.md))
- **Retries:** Volume resends until it receives a `200`. Any other response counts as a failure.

## Which Payment Statuses Trigger a Volume Webhook?

There is no event-type header and no `type` or `event` field. The body field
`paymentStatus` is the discriminator, and Volume sends it only for these final
statuses:

| `paymentStatus` | Triggered when | Common use cases |
|---|---|---|
| `COMPLETED` | The payment succeeded | Fulfil the order, email a receipt, notify the customer |
| `SETTLED` | Funds settled. **Only returned when using a virtual account** | Internal/operational reconciliation and treasury |
| `FAILED` | The payment was rejected. `errorDescription` says why | Mark the order failed, prompt the customer to retry |

Volume's docs: *"COMPLETED webhook should be used to notify the customer of a
successful transaction, while the SETTLED status is intended for internal
operational purposes."*

With a virtual account, one payment produces **two** webhooks: `COMPLETED`, then
`SETTLED`. Key idempotency on `paymentId` + `paymentStatus`, not on `paymentId`
alone.

Volume doesn't document any other statuses for webhooks. If you receive
an unexpected value, log it and return `200`.

## Event Payload Structure

```json
{
  "paymentId": "e4a16e48-18ea-4574-acba-1580510465bc",
  "merchantPaymentId": "1648156842-USER447",
  "paymentStatus": "SETTLED",
  "errorDescription": null,
  "paymentRequest": {
    "amount": 100.00,
    "currency": "GBP",
    "reference": "51568136484643VL1O"
  },
  "paymentRefundData": {
    "accountHolderName": "John Doe",
    "accountIdentifications": [
      { "type": "ACCOUNT_NUMBER", "number": "12345678" },
      { "type": "SORT_CODE", "number": "123456" }
    ]
  },
  "paymentMetadata": { "email": "email@mail.com" },
  "applicationId": "41f75930-ef98-40d8-b6f7-5ee2b01bd3b3",
  "isExternal": false,
  "confirmationOfPayer": { "enabled": true, "score": 54, "riskCategory": "MEDIUM" }
}
```

| Field | Type | Notes |
|---|---|---|
| `paymentId` | string (UUID) | Volume's payment ID. Use it as the idempotency key |
| `merchantPaymentId` | string, optional | Your own ID for the payment |
| `paymentStatus` | string | `COMPLETED`, `SETTLED` or `FAILED` |
| `errorDescription` | string, optional | Set when `FAILED` |
| `paymentRequest.amount` | number | **Major units**: `24.23` means £24.23, not pence |
| `paymentRequest.currency` | string | e.g. `GBP` |
| `paymentRequest.reference` | string, optional | Payment reference |
| `paymentRefundData` | object, optional | Payer's account holder name and account identifications (for refunds) |
| `paymentMetadata` | object, optional | Metadata you supplied when creating the payment |
| `applicationId` | string (UUID) | Your Volume application |
| `isExternal` | boolean | `true` for an external payment, such as a manual bank transfer |
| `confirmationOfPayer` | object, optional | In the docs sample but not the field table. Treat as optional |

**Ignore unknown properties.** Volume can add fields, and strict DTOs that
reject extras will break.

## Reconcile Before You Act

Volume's docs say to verify **all** webhook data, including `amount`,
`merchantPaymentId` and `currency`, against the payment record you created on
your backend, and to **stop processing immediately on a mismatch**. A valid
signature proves Volume sent the message. It doesn't prove the payment matches
the order you're about to fulfil.

## Full Event Reference

See [Volume's webhook documentation](https://docs.getvolume.com/payments/payment-resources/webhooks).
