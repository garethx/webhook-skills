# Fireflies Webhooks Overview

## What Are Fireflies Webhooks?

[Fireflies.ai](https://fireflies.ai) is an AI meeting assistant that records,
transcribes, and summarizes meetings. Fireflies uses webhooks to notify your
application when a meeting has finished processing and its transcript is ready,
so you don't have to poll the GraphQL API for status.

When a transcription completes, Fireflies sends an HTTP POST request to your
configured endpoint with the meeting's ID. Your handler verifies the signature,
then typically calls the Fireflies GraphQL API to fetch the full transcript,
summary, or action items for that meeting.

## Webhooks V1 vs V2

Fireflies has two webhook generations. **This skill documents V1**, the scheme
the Hookdeck Fireflies source maps to. V2 exists and differs in ways that will
break a V1 handler, so identify which one your account sends before debugging:

| | V1 (this skill) | V2 |
|---|---|---|
| Signature header | `x-hub-signature` (lowercase) | `X-Hub-Signature` |
| Header value | bare hex digest, no prefix | `sha256=<hex>` — prefixed |
| Event field | `eventType` | `event` |
| Event names | `Transcription completed` | `meeting.transcribed`, `meeting.summarized`, `meeting.bot_joined` |
| Meeting ID field | `meetingId` | `meeting_id` |
| Response deadline | not documented | 2xx within 10s |

The verification algorithm is the same in both (HMAC-SHA256, hex, timing-safe
compare). Only the header casing, the `sha256=` prefix, and the payload field
names change. A V2 receiver splits the prefix off the header value and then
verifies the hex part exactly as shown in
[verification.md](verification.md).

## Common Event Types

Fireflies delivers the event name inside the JSON body as `eventType` — there is
**no** event-type header. In V1, only one event is documented today:

| `eventType` value | Triggered When | Common Use Cases |
|-------------------|----------------|------------------|
| `Transcription completed` | A meeting has been processed and the transcript is ready | Fetch transcript/summary, sync notes to CRM, post to Slack, trigger downstream automation |

## Event Payload Structure

Every webhook body is a small JSON object:

```json
{
  "meetingId": "01HXXXXXXXXXXXXXXXXXXXXXXX",
  "eventType": "Transcription completed",
  "clientReferenceId": "your-optional-upload-reference"
}
```

| Field | Description |
|-------|-------------|
| `meetingId` | ID of the transcribed meeting. Use it with the GraphQL API to fetch the transcript. |
| `eventType` | The event name. Currently always `Transcription completed`. |
| `clientReferenceId` | Optional custom identifier you passed to the `uploadAudio` mutation. Absent for meetings not created via upload. |

The webhook is intentionally minimal — it is a notification, not the transcript
itself. After verifying, query the Fireflies GraphQL API with the `meetingId`
to retrieve the transcript sentences, summary, and metadata.

## Delivery Notes

- Requests are `POST` with a JSON body and the `x-hub-signature` header.
- Fireflies does not publish an explicit retry policy, so make your handler
  **idempotent** on `meetingId` in case the same event arrives more than once.
- Acknowledge quickly with a `2xx` and do heavy work (API fetch, processing)
  asynchronously.

## Where Webhooks Are Configured

- **Global:** Settings → Developer Settings in the Fireflies dashboard — set the
  HTTPS webhook URL and a 16–32 character signing secret.
- **Per-upload:** Pass a `webhook` URL in the `uploadAudio` GraphQL mutation to
  receive the completion event for that specific upload.

## Full Event Reference

For the complete webhook documentation, see [Fireflies Webhooks](https://docs.fireflies.ai/graphql-api/webhooks).
