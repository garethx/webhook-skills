# Microsoft SharePoint Webhooks - Express Example

Minimal example of receiving Microsoft SharePoint list webhooks with the `validationtoken` handshake and `clientState` validation.

## Prerequisites

- Node.js 18+
- A SharePoint list subscription (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SHAREPOINT_CLIENT_STATE` in `.env` to the same opaque string you pass as `clientState` when creating the subscription.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

- Handshake + notifications: `POST /webhooks/microsoft-sharepoint`
- Health check: `GET /health`

## How It Works

1. **Validation handshake** — on subscription creation, SharePoint POSTs with a `validationtoken` query param. The handler echoes it back as `text/plain` with `200` (within ~5 seconds), which is required for the subscription to be created.
2. **clientState** — each notification's `clientState` is timing-safe compared to `SHAREPOINT_CLIENT_STATE`. Mismatches return `400`.
3. **Thin payload** — notifications carry no change details. The handler logs the list `resource` GUID; in production you call the list GetChanges API with a stored change token to learn what changed.

## Test

```bash
npm test
```

The tests cover the handshake, valid/invalid `clientState`, batched notifications, and the health check.

## Local Development

Expose your local server to SharePoint with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 microsoft-sharepoint --path /webhooks/microsoft-sharepoint
```

Use the printed public URL as the `notificationUrl` when you create the subscription.
