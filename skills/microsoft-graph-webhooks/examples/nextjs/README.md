# Microsoft Graph Webhooks - Next.js Example

Minimal example of receiving Microsoft Graph change notifications (webhooks) with
the endpoint validation handshake and `clientState` verification, using the
Next.js App Router.

## Prerequisites

- Node.js 18+
- A Microsoft Entra app registration with permission to your resource
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local dev)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `MICROSOFT_GRAPH_CLIENT_STATE` to the opaque secret you'll pass as
   `clientState` when creating the subscription.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward Microsoft Graph notifications to your local server (no account needed)
npx hookdeck-cli listen 3000 microsoft-graph --path /webhooks/microsoft-graph
```

Use the printed HTTPS URL as the `notificationUrl` when creating the
subscription. Graph immediately calls it with `?validationToken=...`; the handler
echoes the token so the subscription is created.

### Run Unit Tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/microsoft-graph` — Answers the `validationToken` handshake,
  verifies `clientState`, and dispatches `created`/`updated`/`deleted` change
  notifications and `reauthorizationRequired`/`subscriptionRemoved`/`missed`
  lifecycle events.
