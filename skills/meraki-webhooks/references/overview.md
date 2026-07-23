# Cisco Meraki Webhooks Overview

## What Are Meraki Webhooks?

Cisco Meraki Dashboard **webhook alerts** are HTTP POST notifications sent to an
"HTTP server" you register in the Dashboard. When a configured network alert
fires (a camera detects motion, a sensor crosses a threshold, an access point
stops reporting, someone changes settings, etc.), Meraki POSTs a JSON body to
your endpoint — typically **within ~90 seconds** of the event.

Key differences from most webhook providers:

- **No HMAC signature header.** Authenticity is (optionally) proven by a plaintext
  `sharedSecret` field carried **inside the JSON body**, not a header. See
  [verification.md](verification.md).
- **TLS is the real protection.** Because the secret is unencrypted, Meraki
  requires HTTPS with a publicly trusted (CA-signed) certificate — self-signed
  certs are rejected.
- **Custom templates.** The payload can be reshaped with the Liquid template
  language, so the default schema below is not guaranteed when a custom template
  is selected.

## Common Alert Types

Payloads carry both `alertType` (a human-readable label that can change) and
`alertTypeId` (a stable machine identifier). **Dispatch on `alertTypeId`.**

| `alertTypeId` | `alertType` | Triggered When | Common Use Cases |
|---------------|-------------|----------------|------------------|
| `motion_alert` | Motion detected | An MV camera detects motion | Security automation, snapshots |
| `settings_changed` | Settings changed | A configuration change is made | Change auditing, compliance |
| `sensor_alert` | Sensor change detected | An MT sensor crosses a threshold (water, temperature, door) | Facilities alerting, incident creation |
| `stopped_reporting` | APs went down | One or more devices stop reporting to the Dashboard | Uptime monitoring, on-call paging |

This is a small sample. The set of alert types is large and evolves. Fetch the
**live, per-organization list** from the Dashboard API:

```
GET /organizations/{organizationId}/webhooks/alertTypes
```

## Event Payload Structure

Default (non-templated) payload fields:

| Field | Description |
|-------|-------------|
| `version` | Webhook payload schema version (e.g. `0.1`) |
| `sharedSecret` | Plaintext secret you configured (optional) — used for verification |
| `sentAt` | UTC timestamp when Meraki sent the webhook |
| `occurredAt` | UTC timestamp when the underlying event occurred |
| `organizationId` / `organizationName` / `organizationUrl` | Organization identifiers and Dashboard link |
| `networkId` / `networkName` / `networkUrl` | Network identifiers and Dashboard link |
| `deviceSerial` | Serial of the device that generated the alert (when applicable) |
| `alertId` | Unique identifier for this alert occurrence |
| `alertType` | Human-readable alert label (e.g. `Motion detected`) |
| `alertTypeId` | Stable machine identifier (e.g. `motion_alert`) — dispatch on this |
| `alertLevel` | Severity/level of the alert (when applicable) |
| `alertData` | Object whose fields vary per alert type |

### Example payload

```json
{
  "version": "0.1",
  "sharedSecret": "your_shared_secret",
  "sentAt": "2026-07-23T18:04:20.123Z",
  "organizationId": "2930418",
  "organizationName": "My Organization",
  "organizationUrl": "https://dashboard.meraki.com/o/VjjsAd/manage/organization/overview",
  "networkId": "N_24329156",
  "networkName": "Main Office",
  "networkUrl": "https://n1.meraki.com/...",
  "deviceSerial": "Q234-ABCD-5678",
  "alertId": "0000000000000000",
  "alertType": "Motion detected",
  "alertTypeId": "motion_alert",
  "alertLevel": "informational",
  "occurredAt": "2026-07-23T18:02:53.000Z",
  "alertData": {}
}
```

## Delivery & Reliability

- **Timing:** Alerts are typically delivered within ~90 seconds of the event.
- **Test:** The "Send test" button on the HTTP server posts a sample payload.
- **Auto-disable:** If delivery consistently fails for **more than 100 attempts
  in 24 hours**, Meraki disables the receiver and emails the administrators.
  Return `2xx` quickly and process asynchronously to avoid this.

## SDKs

Meraki's official SDKs (e.g. the Python `meraki` package, Dashboard API clients)
are **Dashboard API clients only** — they call the REST API and **do not verify
webhooks** (there is no signature to verify). Verification is a plaintext string
compare you implement yourself; the SDK is only useful for calling
`GET /organizations/{organizationId}/webhooks/alertTypes` or managing HTTP
servers programmatically.

## Full Event Reference

- [Meraki Webhooks documentation](https://developer.cisco.com/meraki/webhooks/)
- [Shared secret verification](https://developer.cisco.com/meraki/webhooks/introduction/#shared-secret)
