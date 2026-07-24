# Microsoft SharePoint Webhooks Overview

## What Are SharePoint Webhooks?

SharePoint webhooks let your application subscribe to notifications about changes in a SharePoint **list** or **document library** without polling. When items change, SharePoint sends an HTTP `POST` to your registered `notificationUrl`.

Key characteristics:

- **Scope is list-item / document-library events only.** There is no site- or tenant-wide webhook; you subscribe per list.
- **No request signature.** SharePoint webhooks are not HMAC-signed and are not Standard Webhooks. Authenticity is established by the validation handshake and the optional `clientState` shared secret.
- **Asynchronous only.** Webhooks fire *after* a change (the `-ed` events like ItemAdded), never before. Synchronous (`-ing`) events are not available.
- **Thin, batched payloads.** A single request can contain multiple notifications under a `value` array, and none of them describe what changed — you call GetChanges to find out.

## The Two-Part Trust Model

### 1. Validation handshake

When a subscription is created (or its `notificationUrl` changes), SharePoint POSTs to your endpoint with a `validationtoken` query-string parameter and an empty body:

```
POST https://your-app.example.com/webhooks/microsoft-sharepoint?validationtoken=<randomString>
Content-Length: 0
```

Your endpoint must respond `200 OK` with `Content-Type: text/plain` and the exact token as the body, **within ~5 seconds**. Otherwise the subscription is never created.

### 2. clientState

At subscription time you may set `clientState` — an opaque string. SharePoint echoes it back in the `clientState` field of every notification. Compare it to your stored secret as a shared-secret sanity check. It is the only per-message identity signal (treat it like a shared secret, not a signature).

## Notification Payload Structure

```json
{
  "value": [
    {
      "subscriptionId": "91779246-afe9-4525-b122-6c199ae89211",
      "clientState": "your-opaque-secret",
      "expirationDateTime": "2016-04-30T17:27:00.0000000Z",
      "resource": "b9f6f714-9df8-470b-b22e-653855e1c181",
      "tenantId": "00000000-0000-0000-0000-000000000000",
      "siteUrl": "/",
      "webId": "dbc5a806-e4d4-46e5-951c-6344d70b62fa"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `subscriptionId` | Unique identifier for the subscription resource |
| `clientState` | The opaque string you set at subscription time (optional) |
| `expirationDateTime` | When the subscription expires if not renewed |
| `resource` | GUID of the **list** where the subscription is registered |
| `tenantId` | Tenant that generated the notification |
| `siteUrl` | Server-relative URL of the site |
| `webId` | GUID of the web where the subscription is registered |

The payload contains **no change details**. Use `resource` (the list GUID) to call GetChanges.

## Reacting to Changes: GetChanges

Because notifications are thin, the standard flow is:

1. Receive the notification (after passing the handshake and clientState check).
2. Return `200` quickly (within seconds) so SharePoint does not retry.
3. Asynchronously call the list [GetChanges API](https://learn.microsoft.com/en-us/sharepoint/dev/apis/webhooks/lists/overview-sharepoint-list-webhooks) with the **change token** you stored last time.
4. Process each returned change and store the new change token for next time.

## Change Types (from GetChanges)

Each change returned by GetChanges has a `ChangeType`:

| ChangeType | List event | Triggered when |
|------------|------------|----------------|
| `Add` | ItemAdded | An item or file is created |
| `Update` | ItemUpdated | An item or file is modified |
| `DeleteObject` | ItemDeleted | An item or file is deleted |
| `Rename` | ItemRenamed | An item or file is renamed |
| `Restore` | ItemRestored | An item is restored from the recycle bin |
| `MoveAway` | ItemMovedOut | An item or file is moved out of the location |
| `MoveInto` | ItemMovedInto | An item or file is moved into the location |

## Retries

If your endpoint returns a status code outside `200`–`299` or times out, SharePoint retries **5 times at 5-minute intervals**. After 5 failed attempts the notification is dropped — but the next successful call to GetChanges recovers everything missed, because the change log is authoritative.

## Expiration

Subscriptions expire after at most **180 days** (the default if you do not set `expirationDateTime`). You must renew a subscription with a `PATCH` before it lapses, or you stop receiving notifications.

## Full Reference

- [Overview of SharePoint webhooks](https://learn.microsoft.com/en-us/sharepoint/dev/apis/webhooks/overview-sharepoint-webhooks)
- [SharePoint list webhooks](https://learn.microsoft.com/en-us/sharepoint/dev/apis/webhooks/lists/overview-sharepoint-list-webhooks)
