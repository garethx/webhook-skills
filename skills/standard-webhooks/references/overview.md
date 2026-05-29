# Standard Webhooks Overview

## What Are Standard Webhooks?

[Standard Webhooks](https://www.standardwebhooks.com/) is an open specification (maintained at [standard-webhooks/standard-webhooks](https://github.com/standard-webhooks/standard-webhooks)) that defines a consistent format for sending and verifying webhook messages. Providers that adopt it agree on:

- The HTTP **headers** sent with every webhook (`webhook-id`, `webhook-timestamp`, `webhook-signature`)
- The **signing algorithm** (HMAC-SHA256 symmetric or ed25519 asymmetric)
- The **secret format** (`whsec_…` for HMAC, `whsk_…` / `whpk_…` for ed25519)
- The recommended **payload envelope** (`type`, `timestamp`, `data`)

The spec does **not** define specific event types — each provider declares its own. What it guarantees is that if your code can verify one Standard Webhooks provider, the same verification logic works for every other Standard Webhooks provider.

## Canonical Headers

| Header | Format | Description |
|---|---|---|
| `webhook-id` | string | Unique message ID. Use as your idempotency key. |
| `webhook-timestamp` | integer | Unix seconds when the message was dispatched. |
| `webhook-signature` | `v1,<base64>` (space-delimited list) | One or more signatures. Multiple entries support key rotation. |

For ed25519 (asymmetric) the signature prefix is `v1a,` instead of `v1,`.

Some Standard-Webhooks-derived providers (e.g. Clerk, anything built on Svix) send `svix-id`, `svix-timestamp`, `svix-signature` aliases. They use the exact same signing algorithm — just rename the headers before passing them to the `standardwebhooks` library.

## Payload Envelope

The spec recommends this top-level shape (providers may add fields):

```json
{
  "type": "contact.created",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "data": {
    "id": "ct_01HABC...",
    "email": "user@example.com"
  }
}
```

| Field | Description |
|---|---|
| `type` | Event name, conventionally `resource.action` (provider-defined) |
| `timestamp` | ISO 8601 timestamp of when the event occurred |
| `data` | Event-specific payload |

## Common Event Patterns

The spec is event-agnostic. Common conventions used by providers that adopt Standard Webhooks:

| Pattern | Examples |
|---|---|
| Resource lifecycle | `contact.created`, `contact.updated`, `contact.deleted` |
| Message/delivery | `message.sent`, `message.delivered`, `message.failed` |
| Async job | `job.started`, `job.succeeded`, `job.failed` |

These match Clerk (`user.created`, `session.created`), Resend (`email.sent`, `email.delivered`), Replicate (`prediction.completed`), and OpenAI (`batch.completed`) — all of which implement Standard Webhooks.

> Always confirm the exact event strings against your provider's documentation. The spec does **not** standardize event names.

## Providers That Implement Standard Webhooks

This list reflects providers covered by sibling skills in this repo. It is not exhaustive — consult [the spec's adopters page](https://www.standardwebhooks.com/#resources) for the current set.

- **Clerk** — authentication events (sends `svix-*` aliases)
- **ElevenLabs** — voice generation and call events
- **Google Gemini** — static-secret webhooks (dynamic mode uses JWKS instead)
- **OpenAI** — batch / fine-tune / eval completion
- **Replicate** — ML prediction lifecycle
- **Resend** — transactional email delivery

Providers with the same look-and-feel but a different signing scheme — notably Knock (uses its own `x-knock-signature` header with millisecond timestamps) — are not Standard Webhooks. Check the provider's docs for `webhook-id` / `webhook-timestamp` / `webhook-signature` headers (or `svix-*` aliases) to confirm spec compliance.

For the canonical specification, see the [Standard Webhooks spec on GitHub](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md).
