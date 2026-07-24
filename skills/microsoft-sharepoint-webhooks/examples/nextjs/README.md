# Microsoft SharePoint Webhooks - Next.js Example

Minimal example of receiving Microsoft SharePoint list webhooks in a Next.js App Router route handler, with the `validationtoken` handshake and `clientState` validation.

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

3. Set `SHAREPOINT_CLIENT_STATE` to the same opaque string you pass as `clientState` when creating the subscription.

## Route

The handler lives at `app/webhooks/microsoft-sharepoint/route.ts` and is served at:

```
POST /webhooks/microsoft-sharepoint
```

## How It Works

1. **Validation handshake** — when `?validationtoken=...` is present, the route echoes the token back as `text/plain` with `200` (required within ~5 seconds for the subscription to be created).
2. **clientState** — each notification's `clientState` is timing-safe compared to `SHAREPOINT_CLIENT_STATE`. Mismatches return `400`.
3. **Thin payload** — notifications carry no change details. In production, call the list GetChanges API with a stored change token to learn what changed.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

Tests invoke the route handler directly for the handshake, valid/invalid `clientState`, and batched notifications.

## Local Development

Expose your local server to SharePoint with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 microsoft-sharepoint --path /webhooks/microsoft-sharepoint
```

Use the printed public URL as the `notificationUrl` when you create the subscription.
