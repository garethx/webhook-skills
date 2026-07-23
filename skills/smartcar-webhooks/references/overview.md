# Smartcar Webhooks Overview

## What Are Smartcar Webhooks?

Smartcar webhooks deliver connected-vehicle data to your endpoint via HTTP POST
whenever a subscribed signal changes — instead of you polling the Smartcar API.
This reduces latency, server load, and API costs. You configure which signals to
monitor (battery state of charge, odometer, location, etc.) and which vehicles
to subscribe, then Smartcar POSTs an event to your receiver each time one of
those signals changes or fails to retrieve.

Every webhook is signed with a **hex-encoded HMAC-SHA256** of the raw request
body in the `SC-Signature` header, keyed with your **Application Management
Token**. See [verification.md](verification.md).

## Common Event Types

Smartcar uses an `eventType` field (not a dotted event name) to distinguish
events:

| `eventType` | Triggered When | Common Use Cases |
|-------------|----------------|------------------|
| `VERIFY` | A webhook is created or re-verified from the Dashboard | Echo the hashed `data.challenge` back within 15s to activate the webhook |
| `VEHICLE_STATE` | A monitored signal changes for a subscribed vehicle | Sync data, trigger alerts, update dashboards, record telemetry |
| `VEHICLE_ERROR` | Smartcar cannot retrieve a subscribed signal (OEM outage, vehicle unreachable, permission/compatibility issue) | Surface connection problems; a follow-up `VEHICLE_ERROR` with `state: "RESOLVED"` fires on recovery |

> Legacy v2 `scheduled` and `eventBased` webhooks are **deprecated**. New
> integrations receive the `VERIFY` / `VEHICLE_STATE` / `VEHICLE_ERROR` events
> above (payload `meta.version` `"4.0"`).

## Event Payload Structure

All events share a common envelope: top-level `eventId`, `eventType`, and (for
vehicle events) `vehicleId`, plus a `data` object and a `meta` object.

### VERIFY

```json
{
  "eventId": "52f6e0bb-1369-45da-a61c-9e67d092d6db",
  "eventType": "VERIFY",
  "data": {
    "challenge": "3a5c8f72-e6d9-4b1a-9f2e-8c7d6a5b4e3f"
  },
  "meta": {
    "version": "4.0",
    "webhookId": "5a8e5e38-1e12-4011-a36d-56f120053f9e",
    "webhookName": "Example Webhook",
    "deliveryId": "5d569643-3a47-4cd1-a3ec-db5fc1f6f03b",
    "deliveredAt": 1761896351529
  }
}
```

Respond `200` with `{"challenge": "<hex HMAC of data.challenge>"}`. See
[verification.md](verification.md).

### VEHICLE_STATE

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "VEHICLE_STATE",
  "vehicleId": "9af13248-3b73-4c9d-9a4b-d937ce6bc8e2",
  "data": {
    "user": { "id": "93b3ea96-...", "externalId": "customer-user-abc123" },
    "vehicle": {
      "id": "9af13248-3b73-4c9d-9a4b-d937ce6bc8e2",
      "make": "TESLA", "model": "Model 3", "year": 2020,
      "mode": "live", "powertrainType": "BEV"
    },
    "triggers": [
      { "code": "tractionbattery-stateofcharge", "name": "StateOfCharge", "group": "TractionBattery" }
    ],
    "signals": [
      {
        "code": "tractionbattery-stateofcharge",
        "name": "StateOfCharge",
        "group": "TractionBattery",
        "body": { "unit": "percent", "value": 78 },
        "meta": { "oemUpdatedAt": 1731940328000, "fetchedAt": 1731940330000 }
      }
    ]
  },
  "meta": {
    "version": "4.0",
    "deliveryId": "48b25f8f-9fea-42e1-9085-81043682cbb8",
    "deliveredAt": 1731940328000,
    "webhookId": "abde94ff-d57d-43b9-8d09-6020db2d977a",
    "webhookName": "Battery Monitoring",
    "sequence": 1731940327412,
    "signalCount": 3,
    "mode": "LIVE"
  }
}
```

- `data.triggers` — which signal(s) changed to fire this event.
- `data.signals` — all subscribed signals with their current `body.value` and
  `meta.oemUpdatedAt` / `meta.fetchedAt` timestamps.

### VEHICLE_ERROR

```json
{
  "eventId": "5a537912-9ad3-424b-ba33-65a1704567e9",
  "eventType": "VEHICLE_ERROR",
  "vehicleId": "123e4567-e89b-12d3-a456-426614174000",
  "data": {
    "user": { "id": "93b3ea96-...", "externalId": "customer-user-abc123" },
    "vehicle": { "id": "123e4567-...", "make": "TESLA", "model": "Model 3", "year": 2020, "mode": "live", "powertrainType": "BEV" },
    "errors": [
      {
        "type": "COMPATIBILITY",
        "code": "VEHICLE_NOT_CAPABLE",
        "state": "ERROR",
        "description": "The vehicle is incapable of performing your request.",
        "suggestedUserMessage": "Your car is unable to perform this request.",
        "docURL": "https://smartcar.com/docs/errors/api-errors/compatibility-errors#vehicle-not-capable",
        "resolution": { "type": "CONTACT_SUPPORT" },
        "signals": [
          { "code": "location-preciselocation", "name": "PreciseLocation", "group": "Location" }
        ]
      }
    ]
  },
  "meta": {
    "version": "4.0",
    "deliveryId": "48b25f8f-9fea-42e1-9085-81043682cbb8",
    "deliveredAt": 1761896351529,
    "webhookId": "123e4567-...",
    "webhookName": "Battery Monitoring",
    "mode": "LIVE"
  }
}
```

- `errors[].state` is `"ERROR"` for an active problem and `"RESOLVED"` when it
  clears (a second event) — use this for automated recovery workflows.
- `errors[].type` is one of `CONNECTED_SERVICES_ACCOUNT`, `VEHICLE_STATE`,
  `COMPATIBILITY`, `PERMISSION`.

## Delivery Behavior

- **Timeout:** respond with any `2xx` within **15 seconds**, or the delivery is
  treated as failed (even if your server responds later).
- **Retries:** failed deliveries retry with exponential backoff. Non-2xx status
  codes, timeouts, connection errors, and TLS/SSL handshake failures all trigger
  retries.
- **Ordering:** events are **not** guaranteed to arrive in order. Use signal
  timestamps (`meta.oemUpdatedAt`) to establish actual sequence.
- **Deduplication:** dedupe on **`eventId`** — it stays the same across retries
  of the same event. `meta.deliveryId` is unique per attempt, so don't dedupe on
  it.

## Full Event Reference

For the complete list of events and signals, see
[Smartcar's webhook documentation](https://smartcar.com/docs/integrations/webhooks/overview).
