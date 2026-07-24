# Enode Webhooks Overview

## What Are Enode Webhooks?

[Enode](https://enode.com) provides a unified API for connecting to electric vehicles, chargers, home batteries, HVAC systems, solar inverters, and smart meters across many vendors. Enode uses webhooks to notify your application when a linked device's data changes, when a new device is discovered, or when a user's vendor credentials become invalid — instead of you polling the Enode API for changes.

Webhooks are essential for keeping your application state in sync with the physical world (e.g. current battery level, charge state, or charger availability) and for reacting to lifecycle events like a user linking a new vehicle.

## How Delivery Works

Each webhook delivery is an HTTP `POST` with an `application/json` body containing an **array of events**. A single delivery can contain more than one event, so always iterate the array rather than treating the body as a single object.

Each event object contains at least:

| Field | Description |
|-------|-------------|
| `event` | The colon-delimited event name (e.g. `user:vehicle:updated`) |
| `createdAt` | UTC ISO 8601 timestamp of when the event was generated |
| `version` | The payload schema version for that event |

Additional event-specific fields (e.g. the affected `user`, `vehicle`, or `charger` identifiers) are included depending on the event type.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `user:vehicle:updated` | A linked vehicle's data changed | Sync charge state, battery level, location |
| `user:vehicle:discovered` | A new vehicle was linked by the user | Onboard a device, backfill data |
| `user:vehicle:deleted` | A vehicle was unlinked | Cleanup, stop tracking |
| `user:charger:updated` | A linked charger's data changed | Sync charging status, availability |
| `user:battery:updated` | A home battery's data changed | Track state of charge, power flow |
| `user:hvac:updated` | An HVAC system's data changed | Track set points, mode |
| `user:inverter:updated` | A solar inverter's data changed | Track production statistics |
| `user:meter:updated` | A smart meter's data changed | Track consumption |
| `user:credentials:invalidated` | A user's vendor credentials became invalid | Prompt the user to re-link the account |
| `system:heartbeat` | Enode emits a periodic liveness signal | Monitor that your receiver is reachable |
| `enode:webhook:test` | The Test Webhook endpoint is invoked | Verify your receiver during setup |

Most device categories follow the same `discovered` / `updated` / `deleted` pattern:

- `user:vehicle:{discovered,updated,deleted}`
- `user:charger:{discovered,updated,deleted}`
- `user:battery:{discovered,updated,deleted}`
- `user:hvac:{discovered,updated,deleted}`
- `user:inverter:{discovered,updated,deleted}`
- `user:meter:{discovered,updated,deleted}`
- `user:hem-system:{discovered,updated,deleted}`

## Event Payload Structure

```json
[
  {
    "event": "user:vehicle:updated",
    "createdAt": "2020-04-07T17:04:26Z",
    "version": "1.0.0",
    "user": { "id": "user-id" },
    "vehicle": { "id": "vehicle-id" }
  }
]
```

Key headers included with each delivery:

| Header | Description |
|--------|-------------|
| `x-enode-signature` | HMAC SHA-1 signature formatted `sha1=<hex>` |
| `x-enode-delivery` | Unique ID identifying the delivered payload |

## Full Event Reference

For the complete list of events and payloads, see:
- [Enode Webhooks Guide](https://developers.enode.com/docs/webhooks)
- [Enode API Reference — Webhooks](https://developers.enode.com/api/reference#webhooks)
