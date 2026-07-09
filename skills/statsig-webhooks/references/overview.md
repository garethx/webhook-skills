# Statsig Webhooks Overview

## What Are Statsig Webhooks?

Statsig's Event Webhook streams events from your Statsig project to an HTTP endpoint you control. Instead of pulling data out of Statsig, events are pushed to your endpoint as they are logged—custom events from `logEvent`, feature gate / dynamic config / experiment exposures, and configuration changes made in the Statsig console.

This is useful for piping Statsig events into your own data warehouse, analytics pipeline, or monitoring systems in real time.

## Delivery Format

Statsig delivers events in **batches**. Each request body is a JSON object with a `data` array of event objects:

```json
{
  "data": [
    { "eventName": "statsig::gate_exposure", "...": "..." },
    { "eventName": "my_custom_event", "...": "..." }
  ]
}
```

Always iterate over `data` — a single request can contain many events.

## Common Event Types

Every event carries an `eventName`. Statsig-generated events use the `statsig::` prefix; custom events use whatever name you passed to `logEvent`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `statsig::gate_exposure` | A feature gate is checked (`checkGate`) | Analyze gate exposure, join with conversion data |
| `statsig::config_exposure` | A dynamic config is fetched (`getConfig`) | Track config usage |
| `statsig::experiment_exposure` | An experiment is evaluated (`getExperiment`) | Record experiment assignments |
| `statsig::config_change` | A configuration is changed in the console | Audit log of console changes |
| `<custom>` | A custom event is logged (`logEvent`) | Any product analytics event |

Webhook configuration lets you filter which categories are delivered (Exposures and/or Config Changes).

## Event Payload Structure

A custom event:

```json
{
  "eventName": "my_custom_event",
  "user": { "userID": "a_user", "email": "a.user@email.com" },
  "userID": "a_user",
  "timestamp": "1655231253265",
  "value": "a_custom_value",
  "metadata": { "key_a": "value_a", "key_b": "123" },
  "statsigMetadata": {},
  "timeUUID": "abd2a983-ec0f-11ec-917a-fb8cdaeda578"
}
```

A gate exposure:

```json
{
  "eventName": "statsig::gate_exposure",
  "user": {},
  "userID": "a_user",
  "timestamp": "1655231253265",
  "metadata": {
    "gate": "a_gate",
    "gateValue": "false",
    "ruleID": "default",
    "reason": "Network"
  },
  "timeUUID": "8d7c1040-ec11-11ec-g123-abe2c32fcf46",
  "unitID": "userID"
}
```

Key fields:
- `eventName` - The event type (`statsig::...` or a custom name)
- `user` / `userID` - The user the event was logged for
- `timestamp` - Epoch milliseconds (string-encoded)
- `metadata` - Event-specific details (gate name, config name, rule ID, etc.)
- `timeUUID` - Unique time-based identifier (useful for idempotency)

## Full Event Reference

For the complete specification, see [Statsig's Event Webhook documentation](https://docs.statsig.com/integrations/event_webhook).
