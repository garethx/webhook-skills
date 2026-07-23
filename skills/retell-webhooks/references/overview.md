# Retell AI Webhooks Overview

## What Are Retell AI Webhooks?

Retell AI uses webhooks to notify your application about the lifecycle of voice
calls and chat sessions handled by your agents. Instead of polling the Retell
API, your endpoint receives an HTTP `POST` the moment an event occurs — a call
starts, ends, or finishes post-call analysis.

Webhooks can be configured **account-level** (dashboard Webhooks tab, applies to
every agent) or **agent-level** (the `webhook_url` field on an agent, which
overrides the account-level URL for that agent). See
[setup.md](setup.md) for configuration.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `call_started` | A call begins | Track live calls, update dashboards |
| `call_ended` | A call finishes (audio complete) | Persist call record, trigger follow-ups |
| `call_analyzed` | Post-call analysis completes | Store transcript, sentiment, summary, recording URL |
| `transcript_updated` | The transcript changes during a call | Live captions, real-time monitoring |
| `transfer_started` | An agent-to-agent/human transfer begins | Log routing, notify downstream agents |
| `transfer_bridged` | A transfer is connected | Update call state |
| `transfer_cancelled` | A transfer is cancelled before bridging | Revert routing state |
| `transfer_ended` | A transfer completes | Reconcile call legs |
| `chat_started` | A chat session begins | Track chat sessions |
| `chat_ended` | A chat session ends | Persist chat record |
| `chat_analyzed` | Post-chat analysis completes | Store chat summary, sentiment |

## Event Payload Structure

Voice, call, and transfer events share this shape — an `event` field plus a
`call` object:

```json
{
  "event": "call_analyzed",
  "call": {
    "call_id": "Jabr9TXYYJHfvl6Syypi",
    "call_type": "phone_call",
    "agent_id": "oBeDLoLOeuAbiuaMFXRtDOLriTJ6",
    "call_status": "ended",
    "start_timestamp": 1714608475945,
    "end_timestamp": 1714608491736,
    "transcript": "Agent: Hello...\nUser: Hi...",
    "recording_url": "https://...",
    "call_analysis": {
      "call_summary": "The user asked about...",
      "user_sentiment": "Positive",
      "call_successful": true
    }
  }
}
```

- `transcript_updated` events also include a `transcript_with_tool_calls` array.
- Transfer events (`transfer_*`) include `transfer_destination` and
  `transfer_option`.
- Chat events (`chat_*`) carry a `chat` object with a `chat_id` instead of `call`.

## Which Events Fire When

- `call_started` fires as soon as the call connects.
- `call_ended` fires when the audio stream is done — but analysis may not be
  ready yet.
- `call_analyzed` fires later, once Retell finishes post-call analysis
  (transcript, summary, sentiment). Use this event if you need the analysis.

## Retries & Idempotency

If your endpoint doesn't return a `2xx` status within **10 seconds**, Retell
retries the delivery **up to 3 times**. Because the same event can arrive more
than once, **dedupe on `event` + `call.call_id`** (or `chat.chat_id`) and make
processing idempotent. Return `2xx` quickly and defer heavy work to a queue.

## Full Event Reference

For the complete list of events and payload fields, see
[Retell's webhook documentation](https://docs.retellai.com/features/webhook-overview).
