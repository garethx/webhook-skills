# Setting Up Airtable Webhooks

Airtable webhooks are created **via the API**, not the dashboard. There is no
"add webhook" screen — you POST a specification and Airtable returns the webhook id
and the signing secret.

## Prerequisites

- An Airtable **Personal Access Token (PAT)** or OAuth access token with scopes:
  - `webhook:manage` — create/list/delete webhooks and read payloads
  - `data.records:read` — read record change data in payloads
  - `schema.bases:read` — read field/metadata changes
- The **base id** (`appXXXXXXXXXXXXXX`) you want to watch — find it in the base's
  [API docs](https://airtable.com/developers/web/api/introduction) or URL.
- A publicly reachable `notificationUrl` (use the Hookdeck CLI locally, see SKILL.md).

## Create a Webhook

`POST https://api.airtable.com/v0/bases/{baseId}/webhooks`

```bash
curl -X POST \
  "https://api.airtable.com/v0/bases/$BASE_ID/webhooks" \
  -H "Authorization: Bearer $AIRTABLE_PERSONAL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notificationUrl": "https://example.com/webhooks/airtable",
    "specification": {
      "options": {
        "filters": {
          "dataTypes": ["tableData", "tableFields", "tableMetadata"],
          "changeTypes": ["add", "remove", "update"]
        }
      }
    }
  }'
```

You can narrow the subscription with more filter fields:

```json
{
  "options": {
    "filters": {
      "dataTypes": ["tableData"],
      "changeTypes": ["update"],
      "fromSources": ["client", "formSubmission"],
      "recordChangeScope": "tblXXXXXXXXXXXXXX"
    }
  }
}
```

## Get Your Signing Secret

The create response returns the MAC secret **exactly once** — store it immediately:

```json
{
  "id": "achXYZ7890",
  "macSecretBase64": "3G7...base64...==",
  "expirationTime": "2022-02-08T21:25:05.663Z"
}
```

Save `macSecretBase64` to `AIRTABLE_MAC_SECRET_BASE64`. It is **not retrievable later**
— if you lose it you must delete and recreate the webhook.

## Expiration & Refresh

- Webhooks created with a **PAT or OAuth token expire after 7 days**. Listing payloads
  refreshes the clock, or call the refresh endpoint explicitly:
  `POST /v0/bases/{baseId}/webhooks/{webhookId}/refresh`
- **Payloads are deleted after 7 days** regardless of refresh — fetch them promptly.

## Re-enabling After Failures

If your endpoint fails a ping 13 times, Airtable **disables notifications** for that
webhook. Re-enable with:

`POST /v0/bases/{baseId}/webhooks/{webhookId}/enableNotifications`

```json
{ "enable": true }
```

## Managing Webhooks

- List: `GET /v0/bases/{baseId}/webhooks`
- Delete: `DELETE /v0/bases/{baseId}/webhooks/{webhookId}`
- List payloads: `GET /v0/bases/{baseId}/webhooks/{webhookId}/payloads?cursor={n}`

## Testing Locally

Use the Hookdeck CLI to expose your local server (no account required):

```bash
npx hookdeck-cli listen 3000 airtable --path /webhooks/airtable
```

Point `notificationUrl` at the URL the CLI prints, then edit a record in your base to
trigger a notification.

## References

- [Create a webhook](https://airtable.com/developers/web/api/create-a-webhook)
- [Webhooks overview](https://airtable.com/developers/web/api/webhooks-overview)
- [Personal access tokens](https://airtable.com/developers/web/guides/personal-access-tokens)
