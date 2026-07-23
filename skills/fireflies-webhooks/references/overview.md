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

## Common Event Types

Fireflies delivers the event name inside the JSON body as `eventType` — there is
**no** event-type header. Only one event is documented today:

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
