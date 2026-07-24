# Setting Up Microsoft SharePoint Webhooks

SharePoint webhooks are configured through the REST API, not a dashboard. You create a **subscription** on a specific list or document library.

## Prerequisites

- A SharePoint Online site and a list (or document library) you want to watch
- An app registration (Azure AD app or SharePoint Add-in) with at least **edit / Manage** permission on the target list
- A publicly reachable HTTPS `notificationUrl` (for local development, tunnel with the Hookdeck CLI — see below)

## Permissions

| Application type | Required permission |
|------------------|--------------------|
| Azure AD app | Office 365 SharePoint Online — *Read and write items and lists in all site collections* |
| SharePoint Add-in | List scope — *Manage* |

## Get the List GUID

You subscribe per list. Find the list GUID (used as both the `resource` and in the create URL):

```
GET https://contoso.sharepoint.com/_api/web/lists/getbytitle('Documents')?$select=Id
Accept: application/json;odata=nometadata
```

## Create a Subscription

```http
POST https://contoso.sharepoint.com/_api/web/lists('5C77031A-9621-4DFC-BB5D-57803A94E91D')/subscriptions
Authorization: Bearer <access-token>
Accept: application/json
Content-Type: application/json

{
  "resource": "https://contoso.sharepoint.com/_api/web/lists('5C77031A-9621-4DFC-BB5D-57803A94E91D')",
  "notificationUrl": "https://your-app.example.com/webhooks/microsoft-sharepoint",
  "expirationDateTime": "2016-04-27T16:17:57+00:00",
  "clientState": "your-opaque-secret"
}
```

Request body fields:

| Field | Required | Description |
|-------|----------|-------------|
| `resource` | Yes | The URL of the list to receive notifications from |
| `notificationUrl` | Yes | Your endpoint. SharePoint POSTs notifications here |
| `expirationDateTime` | Yes | When the subscription expires. Must be **≤ 180 days** out |
| `clientState` | No | Opaque shared secret echoed back on every notification |

### The validation handshake happens here

Before returning `201 Created`, SharePoint POSTs to your `notificationUrl` with a `validationtoken` query-string parameter. Your endpoint must echo the token back as `text/plain` with status `200` within ~5 seconds. If it fails, subscription creation fails. Make sure your handler is deployed and reachable **before** you send the create request.

Successful response:

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": "a8e6d5e6-9f7f-497a-b97f-8ffe8f559dc7",
  "expirationDateTime": "2016-04-27T16:17:57Z",
  "notificationUrl": "https://your-app.example.com/webhooks/microsoft-sharepoint",
  "resource": "5c77031a-9621-4dfc-bb5d-57803a94e91d"
}
```

Store the returned `id` — you need it to renew or delete the subscription.

## Renew Before Expiration

Subscriptions last at most 180 days. Renew with a `PATCH` before `expirationDateTime`:

```http
PATCH https://contoso.sharepoint.com/_api/web/lists('5C77031A-...')/subscriptions('a8e6d5e6-...')
Content-Type: application/json

{
  "expirationDateTime": "2016-10-27T16:17:57+00:00"
}
```

A `clientState` change (or `notificationUrl` change) triggers a fresh validation handshake.

## List and Delete Subscriptions

```http
GET    /_api/web/lists('{list-guid}')/subscriptions
DELETE /_api/web/lists('{list-guid}')/subscriptions('{subscription-id}')
```

## Store a Change Token

Because notifications carry no change details, keep a **change token** per list. On the first run, call GetChanges to get the current token; on each notification, call GetChanges with the stored token to retrieve everything since, then persist the new token.

## Local Development

SharePoint requires a public HTTPS `notificationUrl`. Tunnel to your local handler with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 microsoft-sharepoint --path /webhooks/microsoft-sharepoint
```

No account required — the CLI creates a guest account on first run and gives you a public URL to use as your `notificationUrl`, plus a web UI to inspect requests (including the handshake).

## References

- [Create a subscription](https://learn.microsoft.com/en-us/sharepoint/dev/apis/webhooks/lists/create-subscription)
- [Overview of SharePoint webhooks](https://learn.microsoft.com/en-us/sharepoint/dev/apis/webhooks/overview-sharepoint-webhooks)
