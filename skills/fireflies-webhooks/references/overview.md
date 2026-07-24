# Fireflies Webhooks Overview

## What Are Fireflies Webhooks?

[Fireflies.ai](https://fireflies.ai) is an AI meeting assistant that records,
transcribes, and summarizes meetings. Fireflies uses webhooks to notify your
application when something happens to a meeting — the transcript is ready, the
summary is generated, the notetaker bot joined — so you don't have to poll the
GraphQL API for status.

Fireflies sends an HTTP POST request to your configured endpoint with the
meeting's ID. Your handler verifies the signature, then typically calls the
Fireflies GraphQL API to fetch the full transcript, summary, or action items for
that meeting.

## Webhooks V2 vs V1

Fireflies has two webhook generations. **This skill documents V2**, the current
scheme: Fireflies steers new webhook creation to V2 and marks the V1
configuration page as deprecated. V1 still delivers for integrations already on
it, and is retained here as a legacy path.

| | V2 (current) | V1 (legacy) |
|---|---|---|
| Header value | `sha256=<hex>` — prefixed | bare hex digest, no prefix |
| Signature header | `X-Hub-Signature` | `x-hub-signature` |
| Event field | `event` | `eventType` |
| Event names | `meeting.transcribed`, `meeting.summarized`, `meeting.bot_joined` | `Transcription completed` |
| Meeting ID field | `meeting_id` | `meetingId` |
| Reference field | `client_reference_id` | `clientReferenceId` |
| Timestamp field | `timestamp` (unix ms) | not sent |
| Signing secret | optional — no header sent when unset | required, 16–32 chars |
| Event selection | subscribe per webhook | none (single event) |
| Response deadline | 2xx within 10s | not documented |

The verification algorithm is the same in both (HMAC-SHA256, hex, timing-safe
compare). What changes is the `sha256=` prefix, the payload field casing
(snake_case in V2, camelCase in V1), and the event vocabulary. The quickest way
to tell which you are receiving: if the signature header value starts with
`sha256=`, it is V2. See [verification.md](verification.md).

## Common Event Types

Fireflies delivers the event name inside the JSON body as `event` — there is
**no** event-type header. You subscribe to events per webhook when you configure
it, and only subscribed events are delivered.

| `event` value | Triggered When | Common Use Cases |
|---------------|----------------|------------------|
| `meeting.transcribed` | A meeting has been processed and the transcript is ready | Fetch transcript, sync notes to CRM, post to Slack, trigger downstream automation |
| `meeting.summarized` | The AI summary for the meeting has been generated | Pull summary and action items, create tasks, email recaps |
| `meeting.bot_joined` | The Fireflies notetaker bot joined a meeting | Mark the meeting as being recorded, notify participants, start a timer |

## Event Payload Structure

Every webhook body is a small JSON object:

```json
{
  "event": "meeting.transcribed",
  "timestamp": 1710876543210,
  "meeting_id": "ASxwZxCstx",
  "client_reference_id": "be582c46-4ac9-4565-9ba6-6ab4264496a8"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | string | yes | The event name, e.g. `meeting.transcribed`. |
| `timestamp` | number | yes | Unix timestamp in **milliseconds** when the event fired. |
| `meeting_id` | string | yes | ID of the meeting — the same value as the transcript ID. Use it with the GraphQL API. |
| `client_reference_id` | string | no | Custom identifier you passed at upload. Absent for meetings not created via upload. |

The webhook is intentionally minimal — it is a notification, not the transcript
itself. After verifying, query the Fireflies GraphQL API with the `meeting_id`
to retrieve the transcript sentences, summary, and metadata.

## Delivery Notes

- Requests are `POST` with a JSON body and `Content-Type: application/json`.
- Your endpoint must return a `2xx` within **10 seconds**. Failures trigger
  Fireflies' retry logic; the exact retry schedule is not documented.
- Because deliveries can be retried, make your handler **idempotent** on
  `meeting_id` (scoped by `event`, since several events share a meeting ID).
- Acknowledge quickly with a `2xx` and do heavy work (API fetch, processing)
  asynchronously.
- The `X-Hub-Signature` header is sent **only when a signing secret is
  configured**. With no secret, deliveries arrive unsigned.

### Headers on a real delivery

| Header | Notes |
|--------|-------|
| `content-type` | `application/json` |
| `user-agent` | A live V2 delivery sent `Fireflies-Webhook/2.0`. The docs' header table still lists `Fireflies-Webhook/1.0`, so do not use this value for version routing. |
| `x-hub-signature` | Present only when a signing secret is configured. |
| `x-webhook-delivery-id` | **Observed but not documented.** A live test delivery carried e.g. `test-1784907162698340997`. Handy as an idempotency key or log correlation id, but it is not in the published spec — do not depend on it. |

## Where Webhooks Are Configured

- **Dashboard (V2):** the Webhooks V2 configuration page. Set an HTTPS URL,
  optionally add a signing secret, and select which events to subscribe to.
- **Per-upload:** pass a `webhook` URL in the `uploadAudio` GraphQL mutation to
  receive events for that specific upload, along with a `client_reference_id`
  for correlation.

See [setup.md](setup.md) for the full flow.

## Legacy: V1 Payload and Event

V1 delivers a single event with camelCase fields:

```json
{
  "meetingId": "01HXXXXXXXXXXXXXXXXXXXXXXX",
  "eventType": "Transcription completed",
  "clientReferenceId": "your-optional-upload-reference"
}
```

| `eventType` value | Triggered When |
|-------------------|----------------|
| `Transcription completed` | A meeting has been processed and the transcript is ready |

V1 has no event selection (there is only one event), no `timestamp` field, and
requires a 16–32 character signing secret set in Settings > Developer Settings.

## Full Event Reference

- [Fireflies Webhooks V2](https://docs.fireflies.ai/graphql-api/webhooks-v2) — current scheme
- [Fireflies Webhooks (V1)](https://docs.fireflies.ai/graphql-api/webhooks) — legacy scheme
