# Statsig Webhooks Overview

## What Are Statsig Webhooks?

Statsig's **Event Webhook** (surfaced in the dashboard as the **Generic
Webhook** integration) delivers a stream of Statsig activity to an HTTPS
endpoint you control. Depending on how you configure **Event Filtering**, you
receive:

- **Exposures** — events emitted when a user is exposed to a feature gate,
  experiment, or dynamic config.
- **Config Changes** — notifications when a feature gate, experiment, dynamic
  config, or other entity is created or updated.

You configure a single **destination URL** under **Project Settings →
Integrations → Generic Webhook**. Statsig POSTs signed JSON to that URL.

## Request Flow

1. You add the Generic Webhook integration in Project Settings and enter your
   destination URL.
2. You choose which activity to receive with **Event Filtering** (Exposures,
   Config Changes, or both).
3. Statsig POSTs signed JSON **batches** to your endpoint.
4. Every request is signed with HMAC-SHA256. Verify the signature on every
   request before processing the body. See
   [verification.md](verification.md).

## Payload Shapes

Statsig delivers events in **batches**, and the top-level shape depends on the
subscription:

### Exposures — top-level JSON array

Exposure `eventName` values are the fixed strings `statsig::gate_exposure`,
`statsig::config_exposure`, and `statsig::experiment_exposure`; the specific
gate/config/experiment name lives in `metadata`.

```json
[
  {
    "eventName": "statsig::gate_exposure",
    "user": { "userID": "user-123" },
    "timestamp": 1671672194836,
    "metadata": { "gate": "my_feature_gate", "gateValue": "true" }
  }
]
```

### Config Changes — `{ "data": [...] }` envelope

```json
{
  "data": [
    {
      "eventName": "statsig::config_change",
      "timestamp": 1671672194836,
      "metadata": {
        "type": "Feature Gate",
        "name": "my_feature_gate",
        "description": "Enabled the gate for the beta segment",
        "action": "updated"
      }
    }
  ]
}
```

Normalize both shapes with:

```javascript
const items = Array.isArray(payload) ? payload : (payload.data || []);
```

## Config-Change Metadata

Config-change items carry a `metadata` object:

| Field | Description |
|-------|-------------|
| `type` | The entity type, e.g. `"Feature Gate"`, `"Experiment"`, `"Dynamic Config"` |
| `name` | The name of the changed entity |
| `description` | Human-readable description of the change |
| `action` | What happened, e.g. `"created"`, `"updated"` |

## Response Requirements

Return a `2xx` response quickly. If your handler has slow downstream work,
acknowledge with `200` immediately and process the batch asynchronously (queue,
background worker, etc.).

## Retry Behavior

Statsig does **not** document its webhook retry behavior. Assume delivery is
at-least-once and design handlers to be **idempotent** — the same event may
arrive more than once. A stable dedup key can be derived from the event's
`eventName` + `timestamp` (and `metadata.name` for config changes).

## Reference

- [Event Webhook documentation](https://docs.statsig.com/integrations/event_webhook)
- [Webhook signature](https://docs.statsig.com/integrations/event_webhook#webhook-signature)
