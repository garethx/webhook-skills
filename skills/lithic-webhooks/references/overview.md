# Lithic Webhooks Overview

## What Are Lithic Webhooks?

Lithic is a card issuing and money-movement platform. Its [Events API](https://docs.lithic.com/docs/events-api)
pushes real-time notifications ("events") to HTTPS endpoints you register as
**event subscriptions**. Instead of polling the API, your service reacts as cards
are created, transactions authorize and clear, disputes progress, and payments
move.

Lithic webhooks implement the [Standard Webhooks](https://www.standardwebhooks.com/)
specification and are powered by Svix. Every delivery includes `webhook-id`,
`webhook-timestamp`, and `webhook-signature` headers so you can verify
authenticity (see [verification.md](verification.md)).

## Event Payload Structure

Each event body is a JSON object shaped like:

```json
{
  "token": "3b3d3a1c-...",
  "event_type": "card_transaction.updated",
  "created": "2026-07-23T12:00:00Z",
  "payload": {
    "token": "..."
  }
}
```

Key fields:

- `token` — Unique event identifier. Matches the `webhook-id` header and is the
  natural idempotency key.
- `event_type` — The `resource.action` string you switch on (e.g. `card.created`).
- `created` — ISO 8601 timestamp of when the event occurred.
- `payload` — The resource snapshot associated with the event.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `card.created` | A new card is issued | Provision card records, notify the user |
| `card.updated` | A card's state/attributes change | Sync PAUSED/CLOSED state |
| `card_transaction.updated` | A card auth or clearing updates | Reconcile ledgers, update transaction status |
| `payment_transaction.created` | An ACH/money-movement payment is created | Record incoming/outgoing payments |
| `payment_transaction.updated` | A payment changes state | Mark settled/returned, trigger dunning |
| `dispute.updated` | A dispute advances | Progress dispute workflow, notify ops |
| `balance.updated` | A financial account balance changes | Refresh cached balances |
| `three_ds_authentication.created` | A 3DS authentication starts | Handle challenge/decisioning |

## Full Event List

Lithic emits many event types (`resource.action` form), including:

- `account_holder.created`, `account_holder.updated`, `account_holder.verification`
- `account_holder_document.updated`
- `auth_rules.backtest_report.created`
- `balance.updated`
- `book_transfer_transaction.created`, `book_transfer_transaction.updated`
- `card.converted`, `card.created`, `card.reissued`, `card.renewed`, `card.shipped`, `card.updated`
- `card_authorization.challenge`, `card_authorization.challenge_response`
- `card_transaction.enhanced_data.created`, `card_transaction.enhanced_data.updated`, `card_transaction.updated`
- `claim.created`, `claim.updated`
- `claim_document.uploaded`, `claim_document.accepted`, `claim_document.rejected`
- `digital_wallet.tokenization_result`, `digital_wallet.tokenization_updated`
- `digital_wallet.tokenization_two_factor_authentication_code`, `digital_wallet.tokenization_two_factor_authentication_code_sent`
- `dispute.updated`, `dispute_evidence.upload_failed`
- `dispute_transaction.created`, `dispute_transaction.updated`
- `embed.session_generated`, `embed.viewed`
- `external_bank_account.created`, `external_bank_account.updated`
- `external_payment.created`, `external_payment.updated`
- `financial_account.created`, `financial_account.updated`
- `funding_event.created`
- `internal_transaction.created`, `internal_transaction.updated`
- `loan_tape.created`, `loan_tape.updated`
- `management_operation.created`, `management_operation.updated`
- `network_total.created`, `network_total.updated`
- `payment_transaction.created`, `payment_transaction.updated`
- `settlement_report.updated`, `statements.created`
- `three_ds_authentication.challenge`, `three_ds_authentication.created`, `three_ds_authentication.updated`
- `tokenization.approval_request`, `tokenization.result`, `tokenization.updated`
- `tokenization.two_factor_authentication_code`, `tokenization.two_factor_authentication_code_sent`

For the authoritative, current list see Lithic's [Types of Events](https://docs.lithic.com/docs/types-of-events)
documentation.

## Delivery & Retries

Lithic retries failed deliveries with exponential backoff. A subscription that
fails continuously for **5 days** is automatically disabled. Because retries can
deliver the same event more than once, handlers must be **idempotent** — dedupe
on the event `token` (`webhook-id`).
