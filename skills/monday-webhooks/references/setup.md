# Setting Up monday.com Webhooks

## Prerequisites

- A monday.com account with access to the target board
- Your application's public HTTPS webhook endpoint URL (max 255 characters)
- For JWT verification: a monday.com **app** with a Signing Secret (see below)

There are two ways to create a webhook: the no-code Integrations center, or the
`create_webhook` GraphQL mutation. Both trigger the challenge handshake at creation.

## Option A — No-code (Integrations center)

1. Open the board → **Integrate** (top-right) → search **"Webhooks"**.
2. Choose a recipe, e.g. *"When a column changes, send a webhook to a URL"*.
3. Enter your endpoint URL (`https://your-app.com/webhooks/monday`).
4. monday.com POSTs the `challenge` token to your URL — your endpoint must echo it
   back to complete setup (see [verification.md](verification.md)).

> No-code webhooks may **not** include the JWT `Authorization` header. Rely on the
> challenge handshake plus, optionally, a secret path/token for these.

## Option B — GraphQL `create_webhook` mutation

Create one webhook per event type. Arguments: `board_id` (required), `url`
(required, ≤255 chars), `event` (required), and optional `config` for
`change_specific_column_value` / `change_status_column_value`.

```graphql
mutation {
  create_webhook(
    board_id: 1234567890,
    url: "https://your-app.com/webhooks/monday",
    event: change_status_column_value,
    config: "{\"columnId\":\"status\"}"
  ) {
    id
    board_id
  }
}
```

You can send this with any HTTP client, or with the official `monday-sdk-js`
(`^0.5.9`) SDK, which is used for making monday.com **API** calls (it does not
provide webhook signature verification helpers):

```javascript
import mondaySdk from 'monday-sdk-js';

const monday = mondaySdk();
monday.setToken(process.env.MONDAY_API_TOKEN);

await monday.api(`
  mutation {
    create_webhook(board_id: 1234567890, url: "https://your-app.com/webhooks/monday", event: create_item) {
      id
    }
  }
`);
```

> **Note:** For the JWT `Authorization` header to be sent with each webhook request,
> the webhook must be created by an **integration app** (using the app's token), not
> a personal API token.

## Get Your Signing Secret

The Signing Secret is used to verify the JWT monday.com sends on each request.

1. Go to **monday.com Developer Center** → your app → **Basic Information**.
2. Copy the **Signing Secret** (board/integration webhooks) into
   `MONDAY_SIGNING_SECRET`.
3. For **app lifecycle** webhooks (install/uninstall), use the app's **Client
   Secret** instead — the verification code is identical.

```bash
MONDAY_SIGNING_SECRET=your_signing_secret_here
```

## Register the Endpoint (summary)

1. Deploy your endpoint so it is reachable over HTTPS (use the Hookdeck CLI tunnel
   for local development — see below).
2. Create the webhook via Option A or B above.
3. Ensure your endpoint echoes the `challenge` token at creation time.
4. Confirm you begin receiving `event`-wrapped payloads.

## Local Development

Use the Hookdeck CLI to receive webhooks on your local machine — no account required:

```bash
npx hookdeck-cli listen 3000 monday --path /webhooks/monday
```

Point the webhook `url` at the public URL the CLI prints. It also gives you a web UI
to inspect and replay requests.

## Testing

- Trigger real events by editing items on the board (change a status, create an item).
- monday.com **retries once a minute for 30 minutes** on non-2xx responses, so a
  broken endpoint will keep receiving the same event — deduplicate on `triggerUuid`.
