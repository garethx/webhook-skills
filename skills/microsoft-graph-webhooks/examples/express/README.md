# Microsoft Graph Webhooks - Express Example

Minimal example of receiving Microsoft Graph change notifications (webhooks) with
the endpoint validation handshake and `clientState` verification.

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
   cp .env.example .env
   ```

3. Set `MICROSOFT_GRAPH_CLIENT_STATE` to the opaque secret you'll pass as
   `clientState` when creating the subscription. To create a subscription with
   the bundled helper, also fill in `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`,
   `MICROSOFT_CLIENT_SECRET`, and `NOTIFICATION_URL`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward Microsoft Graph notifications to your local server (no account needed)
npx hookdeck-cli listen 3000 microsoft-graph --path /webhooks/microsoft-graph
```

Use the printed HTTPS URL as `NOTIFICATION_URL`, then create a subscription:

```bash
npm run subscribe
```

Graph immediately calls your endpoint with `?validationToken=...`; the handler
echoes it back so the subscription is created. Trigger a change on the resource
(e.g. send yourself an email for `me/messages`) to receive a notification.

### Renew a subscription

```bash
node src/subscribe.js renew <subscription-id>
```

### Run Unit Tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/microsoft-graph` — Answers the `validationToken` handshake,
  verifies `clientState`, and dispatches `created`/`updated`/`deleted` change
  notifications and `reauthorizationRequired`/`subscriptionRemoved`/`missed`
  lifecycle events.
