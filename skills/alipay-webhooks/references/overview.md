# Alipay (Antom / Alipay+) Webhooks Overview

## What Are Alipay Webhooks?

Alipay's global payment products — **Antom** (Cashier Payment / Auto Debit,
built on the AMS API) and **Alipay+** (the acquirer-facing gateway) — send
**asynchronous notifications** (webhooks) to your server when a payment,
capture, refund, authorization, or dispute reaches a new state.

Because Alipay processes payments asynchronously, the API response to your
`pay()` / `createPaymentSession()` call is often *pending* — the **notification
is the source of truth** for the final result. Your handler must:

1. **Verify** the RSA256 `Signature` header against Antom's public key.
2. **Parse** the raw JSON body and branch on `notifyType`.
3. **Respond** HTTP 200 with a **signed** `SUCCESS` acknowledgement.

If you don't return a valid, signed 200, Antom **retries the notification ~8
times over 24 hours** (0s, 2m, 10m, 10m, 1h, 2h, 6h, 15h).

## Common Event Types

Notifications do **not** carry a `type` field. Instead the body has a
**`notifyType`** string, and each notification corresponds to a notification API
method (`notifyPayment`, `notifyCapture`, etc.). The `result.resultStatus` field
tells you the outcome: `S` (success), `F` (failure), `U` (unknown / pending).

| `notifyType` | Method | Triggered When | Common Use Cases |
|--------------|--------|----------------|------------------|
| `PAYMENT_RESULT` | `notifyPayment` | A payment reaches a final success or failure state | Fulfill the order, mark the cart paid, send a receipt |
| `CAPTURE_RESULT` | `notifyCapture` | A capture (in an auth/capture flow) succeeds or fails | Settle funds after shipping, reconcile ledgers |
| `REFUND_RESULT` | `notifyRefund` | A refund finishes processing | Update the refund record, notify the customer |
| `AUTHORIZATION_RESULT` | `notifyAuthorization` | An authorization is granted or cancelled | Enable Auto Debit / agreement-based payments |
| `DISPUTE_CREATED` | `notifyDispute` | A dispute (chargeback) is opened | Alert risk/ops, gather evidence |
| `DISPUTE_JUDGED` | `notifyDispute` | A dispute is judged (won/lost) | Update the dispute outcome, adjust ledgers |

## Event Payload Structure

A `notifyPayment` (`PAYMENT_RESULT`) body looks roughly like:

```json
{
  "notifyType": "PAYMENT_RESULT",
  "result": {
    "resultCode": "SUCCESS",
    "resultStatus": "S",
    "resultMessage": "success"
  },
  "paymentRequestId": "pay_20260724_0001",
  "paymentId": "20260724194010800100188420201535803",
  "paymentAmount": { "value": "8000", "currency": "USD" },
  "paymentCreateTime": "2026-07-24T10:00:00Z",
  "paymentTime": "2026-07-24T10:00:05Z"
}
```

Key fields:

- **`notifyType`** — which notification this is (branch on this).
- **`result.resultStatus`** — `S` / `F` / `U`. Only treat `S` as a completed success.
- **`paymentRequestId`** — *your* idempotency key; the reference you sent on `pay()`.
- **`paymentId`** — Antom's payment identifier.
- **`paymentAmount`** — `{ value, currency }`; `value` is a minor-unit string (e.g. cents).

Refunds carry `refundRequestId` / `refundId` / `refundAmount`; captures carry
`captureRequestId` / `captureId` / `captureAmount`. Always reconcile on the
`*RequestId` you generated.

## Legacy openapi / MAPI Integration (different scheme)

Older Alipay Global / cross-border integrations on `openapi.alipay.com` or
`global.alipay.com` use a **form-encoded** notification with a `sign` field and
`sign_type=RSA2`. Verification there means stripping `sign`/`sign_type`, sorting
the remaining params alphabetically, joining with `&`, verifying the RSA2
signature, and replying with the plain text `success`. That is a **separate,
older vintage** and is not what this skill implements. If your notification body
is `application/x-www-form-urlencoded` with a `sign` parameter, you are on that
path.

## Full Event Reference

- [Antom Cashier Payment notifications](https://docs.antom.com/ac/cashierpay/notifications)
- [Alipay+ acquirer signature spec](https://docs.alipayplus.com/alipayplus/alipayplus/api_acq_tile/signature)
