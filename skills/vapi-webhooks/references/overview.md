# Vapi Webhooks Overview

## What Is the Server URL?

**Vapi** is a voice-AI agent platform. Its outbound webhook endpoint is called
the **Server URL**. When something happens on a call, chat, or session, Vapi
POSTs a JSON message to your Server URL. Unlike most webhook products, the Server
URL is **bidirectional**: for a handful of message types Vapi *waits on your JSON
response* and uses it to drive the live call (pick an assistant, return tool
results, choose a transfer destination, supply knowledge-base documents).

## The Envelope

Every POST body wraps the event in a `message` object. **The event type is nested
at `message.type`** — there is no top-level `type` field.

```json
{
  "message": {
    "type": "status-update",
    "status": "in-progress",
    "call": { "id": "8f8...", "orgId": "..." },
    "phoneNumber": { "id": "...", "number": "+1..." },
    "assistant": { "id": "..." },
    "customer": { "number": "+1..." },
    "timestamp": 1712345678000,
    "artifact": { "messages": [], "recordingUrl": null, "transcript": "" }
  }
}
```

Common fields across most messages:

| Field | Description |
|-------|-------------|
| `message.type` | The server-message type — dispatch on this |
| `message.call` | The Call object the event relates to (`call.id` is a good idempotency key) |
| `message.phoneNumber` | The phone number involved (for phone calls) |
| `message.assistant` | The assistant handling the call |
| `message.customer` | The other party |
| `message.timestamp` | Epoch-millis timestamp of the message |
| `message.artifact` | Recording URL, transcript, and message history (as they become available) |

> Field availability varies by message type and configuration — treat
> type-specific fields defensively. Trust the
> [Server Events reference](https://docs.vapi.ai/server-url/events) for the
> authoritative envelope and catalog.

## Message Types

### Request/response types — a JSON body is REQUIRED

Vapi blocks on your response for these four. Returning a bare `200` (or the wrong
shape) breaks the call.

| `message.type` | Fires When | You Respond With |
|----------------|------------|------------------|
| `assistant-request` | An inbound call's number has no assistant configured | `{ "assistantId" }`, transient `{ "assistant" }`, `{ "destination" }`, or `{ "error" }` |
| `tool-calls` | The assistant invoked a function/tool | `{ "results": [ { "name", "toolCallId", "result" } ] }` |
| `transfer-destination-request` | A `transferCall` tool ran without a destination | `{ "destination": {…}, "message": {…} }` |
| `knowledge-base-request` | The assistant uses a `custom-knowledge-base` | `{ "documents": [ { "content", "similarity", "uuid" } ] }` |

**`assistant-request` has a hard, non-configurable ~7.5-second end-to-end
timeout.** The telephony provider caps call setup at 15s and Vapi reserves about
half for its own setup, so your handler must answer well within ~7.5s. The
timeout value shown elsewhere in the dashboard does **not** apply here.

### Informational types — a bare `200` is enough

No response body required (dispatch and return `200`):

`status-update`, `end-of-call-report`, `hang`, `conversation-update`,
`transcript`, `speech-update`, `model-output`, `transfer-update`,
`user-interrupted`, `language-change-detected`, `phone-call-control`, and the
`chat.created` / `chat.deleted` / `session.created` / `session.updated` /
`session.deleted` messages.

> `end-of-call-report` is the one to persist for analytics — it carries the final
> transcript, recording URL, cost breakdown, and end reason.

## Dedicated URLs (not the main Server URL)

Two message types are delivered to *separate* configured URLs, not your main
Server URL, and one does not use JSON at all:

- `voice-request` → `assistant.voice.server.url`; expects a **raw PCM audio**
  response stream, not JSON.
- `call.endpointing.request` → the smart-endpointing plan's `server.url`.

Handle these only if you configure those URLs; they are out of scope for the main
handler.

## Server URL Priority

Only one URL receives a given event. When multiple levels define a Server URL,
the most specific wins:

**Custom Tool > Assistant > Phone Number > Account-wide (Organization).**

Each level can carry its own `credentialId` (auth). See
[setup.md](setup.md).

## Idempotency

Vapi may redeliver a message. Deduplicate on a stable key such as
`message.call.id` + `message.type` (+ `message.timestamp` where present) so the
same event is not actioned twice. See
[webhook-handler-patterns / idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).

## Full Documentation

- [Server URL](https://docs.vapi.ai/server-url)
- [Server Events (authoritative envelope + catalog)](https://docs.vapi.ai/server-url/events)
- [Server Authentication](https://docs.vapi.ai/server-url/server-authentication)
