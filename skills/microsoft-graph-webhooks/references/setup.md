# Setting Up Microsoft Graph Webhooks

Microsoft Graph webhooks are configured entirely through the Graph API — there is
no webhook dashboard. You register an app, grant it permission to the resource,
then create a **subscription** that points at your `notificationUrl`.

## Prerequisites

- A Microsoft Entra (Azure AD) tenant.
- An app registration with permission to the resource you want to watch.
- A **publicly reachable HTTPS** endpoint (use the Hookdeck CLI for local dev).

## 1. Register an App

1. Go to the [Microsoft Entra admin center](https://entra.microsoft.com) →
   **Identity** → **Applications** → **App registrations** → **New registration**.
2. Note the **Application (client) ID** and **Directory (tenant) ID**.
3. Under **Certificates & secrets**, create a **client secret**. Copy its value.

## 2. Grant Permissions

Under **API permissions**, add the Microsoft Graph permission for your resource,
for example:

| Resource | Delegated / Application permission |
|----------|-----------------------------------|
| `me/messages`, `users/{id}/messages` | `Mail.Read` |
| `me/events` | `Calendars.Read` |
| Teams channel/chat messages | `ChannelMessage.Read.All` / `Chat.Read.All` |
| OneDrive/SharePoint `driveItem` | `Files.Read.All` / `Sites.Read.All` |
| `users`, `groups` | `User.Read.All` / `Group.Read.All` |
| Presence | `Presence.Read.All` |

For app-only (daemon) scenarios, grant **Application** permissions and click
**Grant admin consent**.

## 3. Set clientState

Choose an opaque secret (max **128 characters**) and store it as
`MICROSOFT_GRAPH_CLIENT_STATE` in your app. You'll pass it as `clientState` when
creating the subscription; Graph echoes it in every notification so you can
verify authenticity.

## 4. Create a Subscription

Send an authenticated request to create the subscription. Graph immediately calls
your `notificationUrl` with `?validationToken=...`; your handler must echo it back
(see [verification.md](verification.md)) or the create call fails.

```http
POST https://graph.microsoft.com/v1.0/subscriptions
Authorization: Bearer {access-token}
Content-Type: application/json

{
  "changeType": "created,updated",
  "notificationUrl": "https://your-app.example.com/webhooks/microsoft-graph",
  "lifecycleNotificationUrl": "https://your-app.example.com/webhooks/microsoft-graph",
  "resource": "me/messages",
  "expirationDateTime": "2026-07-23T18:23:45.9356913Z",
  "clientState": "your-opaque-secret",
  "latestSupportedTlsVersion": "v1_2"
}
```

A successful call returns `201 Created` with the subscription object (including
its `id`). Duplicate subscriptions (same `changeType` + `resource`) return
`409 Conflict`.

### Using the SDK (recommended for create/renew)

The official SDKs manage subscriptions (they do **not** provide a verification
helper). Use the exact current versions:

- Node.js: `@microsoft/microsoft-graph-client@^3.0.7`
- Python: `msgraph-sdk>=1.60.0`

The runnable examples include a subscribe/renew helper:

- Express / Next.js: `examples/express/src/subscribe.js` (uses `@microsoft/microsoft-graph-client`)
- FastAPI: `examples/fastapi/subscribe.py` (uses `msgraph-sdk`)

## 5. Renew Before Expiry

Subscriptions expire quickly. Renew with `PATCH /subscriptions/{id}` and a new
`expirationDateTime` before the current one passes (or in response to a
`reauthorizationRequired` lifecycle event).

```http
PATCH https://graph.microsoft.com/v1.0/subscriptions/{id}
Authorization: Bearer {access-token}
Content-Type: application/json

{ "expirationDateTime": "2026-07-24T18:23:45.9356913Z" }
```

### Maximum Subscription Lifetimes

| Resource | Maximum `expirationDateTime` from now |
|----------|---------------------------------------|
| `presence` | 60 minutes (~1 hour) |
| Teams `chatMessage`, `channel`, `chat` | 4,320 minutes (~3 days) |
| Group `conversation` | 4,230 minutes (~3 days) |
| Outlook `message`/`event`/`contact` | 10,080 minutes (~7 days); **1,440 minutes (~1 day) with resource data** |
| `driveItem` (OneDrive), SharePoint `list` | 42,300 minutes (~30 days) |
| `user`, `group`, other directory resources | 41,760 minutes (~29 days) |
| Security `alert` | 43,200 minutes (~30 days) |

Any `expirationDateTime` under ~45 minutes from now is bumped up to 45 minutes.

## 6. Rich Notifications (Optional)

To receive the changed data inline (instead of only an ID), subscribe with
`includeResourceData: true` and supply an `encryptionCertificate` (a base64
public RSA cert, 2048–4096 bit) plus `encryptionCertificateId`. Graph then AES-
encrypts the resource data and includes a `validationTokens` array of JWTs. See
[verification.md](verification.md) for validating and decrypting these.

## Local Development

```bash
npx hookdeck-cli listen 3000 microsoft-graph --path /webhooks/microsoft-graph
```

Use the printed HTTPS URL as `notificationUrl` (and `lifecycleNotificationUrl`)
when creating the subscription. No account is required — the CLI creates a guest
account and gives you a tunnel plus a web UI for inspecting requests.

## Test Mode vs Live Mode

Microsoft Graph has no separate test mode. Test against real (non-production)
mailboxes, Teams, or drives, and use short `expirationDateTime` values while
developing so stale subscriptions clean themselves up.
