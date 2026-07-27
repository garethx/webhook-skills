# AiPrise Webhooks Overview

## What Are AiPrise Webhooks?

AiPrise is an identity verification platform for KYC (Know Your Customer) and KYB
(Know Your Business). When a verification session finishes — or when a business
profile changes — AiPrise notifies your server with a **callback**: a signed HTTP
POST to a URL you configure.

Callbacks let you react to verification outcomes asynchronously instead of polling
the AiPrise API. Every callback is signed with HMAC-SHA256 so you can confirm it
genuinely came from AiPrise (see [verification.md](verification.md)).

## Two Callback Destinations

AiPrise sends to two configurable URLs, both signed identically:

| Destination | Configured via | Delivers |
|-------------|----------------|----------|
| Verification result | `callback_url` (or template) | The outcome of a verification session |
| Business-profile events | `events_callback_url` (or template) | Changes to a business profile |

URLs are set at the **template level** (Dashboard → View Templates → `{TemplateID}`)
or overridden per request via the `callback_url` / `events_callback_url` fields.
Request-level values take precedence over the template.

## Verification Results

AiPrise does **not** use a rich typed-event system. The meaningful "event" is the
value of `aiprise_summary.verification_result`:

| `verification_result` | Triggered When | Common Use Cases |
|-----------------------|----------------|------------------|
| `APPROVED` | The individual/business passed verification | Provision access, mark customer verified, unlock features |
| `DECLINED` | Verification failed | Block onboarding, request resubmission, flag for fraud review |
| `REVIEW` | The result needs manual review | Route to a human analyst / compliance queue |
| `UNKNOWN` | The result is indeterminate | Retry, investigate, or ask the user to try again |

Each callback also carries a process status describing the session lifecycle, such
as `COMPLETED`, `PENDING`, or `FAILED`.

## Event Payload Structure

A verification-result callback looks like:

```json
{
  "verification_session_id": "123408f2-2bbb-415f-aafc-92212341234",
  "template_id": "123456-3434-2342-3453-b4218a4fb333",
  "client_reference_id": null,
  "aiprise_summary": {
    "tags": [],
    "reasons": [],
    "notes": [],
    "verification_result": "APPROVED"
  },
  "created_at": 1668974142818
}
```

Key fields:

| Field | Description |
|-------|-------------|
| `verification_session_id` | AiPrise-generated ID for the verification session — your primary correlation key |
| `client_reference_id` | Optional ID you supplied when starting the session — correlate to your own records |
| `template_id` | The verification template that produced this callback |
| `aiprise_summary.verification_result` | The outcome: `APPROVED` / `DECLINED` / `REVIEW` / `UNKNOWN` |
| `aiprise_summary.tags` / `reasons` / `notes` | Additional context on the decision |
| `created_at` | Unix epoch milliseconds when the callback was created |

## Correlating Callbacks

Match a callback to a user or onboarding flow using:

1. `verification_session_id` — always present; store it when you create the session.
2. `client_reference_id` — optional; set it when starting a session to carry your own
   user/order identifier through to the callback.

## Full Event Reference

For the complete callback and authentication documentation, see
[AiPrise Callbacks & Authentication](https://docs.aiprise.com/docs/callbacks-authentication).
