# Azure Event Grid Webhooks Overview

## What Are Azure Event Grid Webhooks?

Azure Event Grid is a managed **pub/sub eventing service**. Publishers (Azure
services, your own custom topics, partner SaaS systems) send events to a topic;
Event Grid routes each event to every matching **event subscription**. A
**WebHook event handler** is one of the supported subscription destinations:
Event Grid POSTs the event to an HTTPS URL you own.

This skill covers **push delivery to a WebHook event handler** in Event Grid
Basic — custom topics, system topics, domains, and partner topics. It does not
cover Event Grid Namespaces *pull* delivery (where you fetch and ack messages
over the data plane), the MQTT broker, Azure Service Bus, or Azure Event Hubs.

Two important consequences of the broker model:

1. **Event Grid does not sign the payload.** There is no signature header, no
   HMAC, no shared signing secret. Authenticity is established by a
   subscription-time ownership handshake plus authentication on the delivery
   channel (a custom header or a Microsoft Entra ID bearer token). See
   [verification.md](verification.md).
2. **Most event types are not Event Grid's.** They belong to whichever service
   or application published them. Treat the tables below as examples of what
   flows through Event Grid, attributed to their publishers — not as a closed
   catalog of "Event Grid events".

## Events Emitted by Event Grid Itself

These come from the `Microsoft.EventGrid` resource provider.

| Event | Triggered When | Data | Common Use Cases |
|-------|----------------|------|------------------|
| `Microsoft.EventGrid.SubscriptionValidationEvent` | An event subscription is created or updated | `validationCode`, `validationUrl` | Complete the ownership handshake by echoing the code |
| `Microsoft.EventGrid.SubscriptionDeletedEvent` | An event subscription pointing at your endpoint is deleted | `eventSubscriptionId` (Azure resource ID) | Clean up per-subscription state; alert on unexpected teardown |
| `Microsoft.EventGrid.MQTTClientCreatedOrUpdated` | An MQTT client is created or updated | Event Grid Namespaces / MQTT broker system topic | Client lifecycle tracking |
| `Microsoft.EventGrid.MQTTClientDeleted` | An MQTT client is deleted | Event Grid Namespaces / MQTT broker system topic | Client lifecycle tracking |
| `Microsoft.EventGrid.MQTTClientSessionConnected` | An MQTT client session connects | Event Grid Namespaces / MQTT broker system topic | Connectivity monitoring |
| `Microsoft.EventGrid.MQTTClientSessionDisconnected` | An MQTT client session disconnects | Event Grid Namespaces / MQTT broker system topic | Connectivity monitoring |

The MQTT events belong to Event Grid Namespaces / the MQTT broker, not to the
Basic push-to-webhook flow this skill focuses on.

## Representative Publisher Event Types

Each of these is defined and emitted by the **publishing service**, and only
arrives at your endpoint if you subscribed to that publisher's topic.

| Publisher | Event | Triggered When |
|-----------|-------|----------------|
| Azure Blob Storage | `Microsoft.Storage.BlobCreated` | A blob is created or replaced |
| Azure Blob Storage | `Microsoft.Storage.BlobDeleted` | A blob is deleted |
| Azure subscription / resource group | `Microsoft.Resources.ResourceWriteSuccess` | A resource write operation succeeds |
| Azure subscription / resource group | `Microsoft.Resources.ResourceWriteFailure` | A resource write operation fails |
| Azure subscription / resource group | `Microsoft.Resources.ResourceWriteCancel` | A resource write operation is cancelled |
| Azure subscription / resource group | `Microsoft.Resources.ResourceDeleteSuccess` | A resource delete succeeds |
| Azure subscription / resource group | `Microsoft.Resources.ResourceDeleteFailure` | A resource delete fails |
| Azure subscription / resource group | `Microsoft.Resources.ResourceDeleteCancel` | A resource delete is cancelled |
| Azure subscription / resource group | `Microsoft.Resources.ResourceActionSuccess` | A resource action succeeds |
| Azure subscription / resource group | `Microsoft.Resources.ResourceActionFailure` | A resource action fails |
| Azure subscription / resource group | `Microsoft.Resources.ResourceActionCancel` | A resource action is cancelled |
| Your custom topic | Whatever your publisher defines | Publisher-defined | Route on `eventType` / `type` and `subject` |

For a custom topic, **you** choose the `eventType` string and the shape of
`data`. Nothing in Event Grid constrains it beyond the envelope.

## Event Payload Structure

### Event Grid schema — a JSON array

Verbatim: *"Event Grid sends the events to subscribers in an array that has a
single event."* Batching is off by default, but it is configurable (up to 5,000
events per batch), so a handler **must** loop over the array.

```json
[
  {
    "topic": "/subscriptions/aaaa0a0a-bb1b-cc2c-dd3d-eeeeee4e4e4e/resourceGroups/contosorg/providers/Microsoft.Storage/storageAccounts/contosostorage",
    "subject": "/blobServices/default/containers/testcontainer/blobs/dataflow.jpg",
    "eventType": "Microsoft.Storage.BlobCreated",
    "id": "aaaaaaaa-0000-1111-2222-bbbbbbbbbbbb",
    "data": {
      "api": "PutBlob",
      "clientRequestId": "bbbbbbbb-1111-2222-3333-cccccccccccc",
      "requestId": "cccccccc-2222-3333-4444-dddddddddddd",
      "eTag": "0x8DD15A69488FE5A",
      "contentType": "image/jpeg",
      "contentLength": 52577,
      "blobType": "BlockBlob",
      "accessTier": "Default",
      "url": "https://contosostorage.blob.core.windows.net/testcontainer/dataflow.jpg",
      "sequencer": "0000000000000000000000000003A13C00000000007da85d",
      "storageDiagnostics": { "batchId": "9d292d9f-e006-00a5-008f-47b300000000" }
    },
    "dataVersion": "",
    "metadataVersion": "1",
    "eventTime": "2024-12-06T03:32:15.7238874Z"
  }
]
```

| Property | Type | Description |
|----------|------|-------------|
| `topic` | string | Full resource path to the event source. Not writeable — Event Grid provides this value |
| `subject` | string | Publisher-defined path to the event subject |
| `eventType` | string | One of the registered event types for this event source |
| `eventTime` | string | The time the event is generated, based on the provider's UTC time |
| `id` | string | Unique identifier for the event — **use this for idempotency** |
| `data` | object | Event data specific to the resource provider |
| `dataVersion` | string | Schema version of the data object; stamped with an empty value if omitted |
| `metadataVersion` | string | Schema version of the event metadata; currently only `1` |

### CloudEvents v1.0 schema — a single JSON object

```json
{
  "specversion": "1.0",
  "type": "Microsoft.Storage.BlobCreated",
  "source": "/subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.Storage/storageAccounts/{storage-account}",
  "id": "9aeb0fdf-c01e-0131-0922-9eb54906e209",
  "time": "2019-11-18T15:13:39.4589254Z",
  "subject": "blobServices/default/containers/{storage-container}/blobs/{new-file}",
  "data": {
    "api": "PutBlockList",
    "contentType": "image/png",
    "contentLength": 30699,
    "blobType": "BlockBlob",
    "url": "https://gridtesting.blob.core.windows.net/testcontainer/{new-file}"
  }
}
```

Note the **shape difference**: Event Grid schema is an array, CloudEvents
structured mode is a single object. A robust handler normalises both:

| Event Grid schema | CloudEvents v1.0 |
|-------------------|------------------|
| `eventType` | `type` |
| `eventTime` | `time` |
| `topic` | `source` |
| `id` | `id` |
| `subject` | `subject` |
| `data` | `data` |
| `metadataVersion` | `specversion` |

Set the output schema per event subscription with
`--event-delivery-schema eventgridschema` or
`--event-delivery-schema cloudeventschemav1_0`.

## Message Headers

| Property name | Description |
|---------------|-------------|
| `aeg-subscription-name` | Name of the event subscription |
| `aeg-delivery-count` | Number of attempts made for the event |
| `aeg-event-type` | `SubscriptionValidation`, `Notification`, or `SubscriptionDeletion` |
| `aeg-metadata-version` | Event Grid schema: metadata version. CloudEvents schema: the **spec version** |
| `aeg-data-version` | Event Grid schema: data version. Not applicable for CloudEvents schema |
| `aeg-output-event-id` | ID of the Event Grid event |

`Content-Type` is `application/json; charset=utf-8` for Event Grid schema and
`application/cloudevents+json; charset=utf-8` for CloudEvents schema.

The `aeg-` prefix is **reserved** for these system properties — never use it for
a custom delivery-property header of your own.

## Delivery Semantics

- **HTTPS only.** *"Event Grid supports only HTTPS webhook endpoints."*
- **At-least-once**, and *"Event Grid doesn't guarantee order for event
  delivery, so subscribers might receive events out of order."* Duplicates are
  normal — de-duplicate on the event `id`, and treat `aeg-delivery-count > 1`
  as a retry of something you may already have processed.
- **Success codes.** *"Event Grid considers **only** the following HTTP response
  codes as successful deliveries"*: `200 OK`, `201 Created`, `202 Accepted`,
  `203 Non-Authoritative Information`, `204 No Content`. Everything outside
  200–204 is a failure. Note the contrast with the validation handshake, where
  **202 is explicitly not accepted**.
- **Not retried for webhook endpoints**: `400 Bad Request`, `401 Unauthorized`,
  `403 Forbidden`, `413 Request Entity Too Large`. The retry-behaviour table
  also lists 401 and 404 as *"Retry after 5 minutes or more for Azure Resources
  Endpoints"* — that row is scoped to Azure resource endpoints, not webhooks.
  The two statements sit in tension in the docs; for a webhook, plan on 401 not
  being retried. Other codes: `408` retries after 2 minutes or more, `503`
  after 30 seconds or more, all others after 10 seconds or more.
- **Timeout.** *"Event Grid waits 30 seconds for a response after delivering a
  message."* Exceeding it queues the message for retry — acknowledge fast and
  process asynchronously.
- **Backoff schedule** (best effort, with small randomisation): 10s, 30s, 1m,
  5m, 10m, 30m, 1h, 3h, 6h, then every 12h up to 24h.
- **Retry policy**: maximum attempts 1–30 (default 30); event TTL 1–1440 minutes
  (default 1440). Whichever expires first stops delivery.
- **Batching** is off by default — *"the payload is an array with a single
  event"*. Max events per batch 1–5,000; preferred batch size 1–1,024 KB.
  Batching is **all-or-none**: there is no partial success, so a handler must
  loop the array and either accept the whole batch or fail it.
- **Size limits**: 1 MB per event and per array; over-size receives
  `413 Payload Too Large`. Operations are charged in 64 KB increments.
- **Dead-lettering** is off by default; enable it with a storage account
  container. `400` and `413` are scheduled for dead-lettering immediately.
  Dead-lettered events gain `deadLetterReason`, `deliveryAttempts`,
  `lastDeliveryOutcome`, `publishTime`, and `lastDeliveryAttemptTime`
  (lowercased in the CloudEvents form).
- **Delayed delivery / probation**: consistently failing endpoints have
  deliveries delayed, in some cases for hours.

## Full Event Reference

- [Event Grid event schema](https://learn.microsoft.com/en-us/azure/event-grid/event-schema)
- [CloudEvents v1.0 schema with Event Grid](https://learn.microsoft.com/en-us/azure/event-grid/cloud-event-schema)
- [System topics (per-publisher event catalogs)](https://learn.microsoft.com/en-us/azure/event-grid/system-topics)
- [Event Schema store (JSON schemas per publisher)](https://github.com/Azure/azure-rest-api-specs/tree/master/specification/eventgrid/data-plane)
- [Delivery and retry](https://learn.microsoft.com/en-us/azure/event-grid/delivery-and-retry)
