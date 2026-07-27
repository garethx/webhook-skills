# Ethoca Webhooks Overview

## What Are Ethoca Alerts Webhooks?

Ethoca, a Mastercard company, operates a network that connects card issuers and
merchants. When an issuer confirms fraud or a cardholder opens a dispute, Ethoca
sends the merchant an **alert** — often before a chargeback is ever filed. Acting
on an alert lets a merchant stop fulfilment, issue a refund, or cancel a
subscription early, avoiding chargeback fees and fraud losses.

The **Alerts Push API** delivers these alerts as HTTP `POST` requests with a JSON
body to an endpoint you register with Ethoca. (A legacy pull/queue model also
exists, where the merchant polls for queued alerts; this skill covers the push
model.)

## How Delivery Works

1. Ethoca opens a **mutual TLS (MSSL)** connection to your registered HTTPS URL,
   presenting a client certificate signed by the **Entrust** CA.
2. Each request carries `Authorization: Basic base64(username:password)` using
   credentials agreed during onboarding.
3. Your endpoint validates the credentials, processes the alert, and returns
   `200`.
4. Separately, you report what you did with the alert (refunded, already
   resolved, etc.) through the **Outcome API**, which is authenticated with
   OAuth 1.0a — see [verification.md](verification.md).

There is **no HMAC signature header** on push alerts. Authenticity is guaranteed
by the mutual-TLS channel plus Basic Auth, not by a signed payload.

## Alert Categories (`alertType`)

Alerts fall into two categories, discriminated by the `alertType` field:

| `alertType` | Triggered When | Common Use Cases |
|-------------|----------------|------------------|
| `fraud` | An issuer confirms or suspects the transaction is fraudulent | Halt fulfilment, refund, cancel subscription, block/flag the account |
| `dispute` | A cardholder initiates a dispute (pre-chargeback) | Refund to prevent a chargeback, gather evidence, update the order |

> **The literal enum values are not published publicly and have historically
> been numeric.** Treat `alertType` as a discriminator whose exact values you
> confirm in your Ethoca onboarding schema, then normalize to the two categories
> above. The examples in this skill use the readable strings `"fraud"` and
> `"dispute"`; add a mapping (e.g. `{"1": "fraud", "2": "dispute"}`) if your
> account delivers numeric codes.

## Event Payload Structure

Ethoca does not publish a single fixed public schema, and fields vary by card
network and onboarding configuration. A representative alert looks like this —
**confirm the exact field names against your onboarding documentation**:

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "alertType": "fraud",
  "eventType": "created",
  "outcome": null,
  "createTimestamp": "2026-07-27T10:30:00Z",
  "issuerName": "Example Bank",
  "card": {
    "bin": "531234",
    "last4": "9012"
  },
  "transaction": {
    "arn": "74987654321098765432109",
    "amount": "125.00",
    "currency": "USD",
    "timestamp": "2026-07-25T14:22:00Z"
  }
}
```

Commonly useful fields:

| Field | Description |
|-------|-------------|
| `id` | Unique alert identifier — use it for idempotency |
| `alertType` | `fraud` or `dispute` (see note above) |
| `outcome` | Present/echoed once you report an outcome via the Outcome API |
| `transaction.arn` | Acquirer Reference Number — key for matching to your order |
| `transaction.amount` / `currency` | Disputed/fraudulent amount |
| `card.bin` / `card.last4` | Masked card details to help match the transaction |

## Idempotency

Ethoca may redeliver an alert (for example after a timeout or transient error).
Key deduplication on the alert `id` so the same alert is not actioned twice. See
[webhook-handler-patterns / idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).

## Full Documentation

- [Ethoca Alerts Push API reference](https://developer.mastercard.com/ethoca-alerts-for-merchants/documentation/api-reference/push-api-ref/)
- [Ethoca Alerts API basics](https://developer.mastercard.com/ethoca-alerts-for-merchants/documentation/api-basics/)
