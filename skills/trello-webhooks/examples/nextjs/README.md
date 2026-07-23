# Trello Webhooks - Next.js Example

Minimal example of receiving Trello webhooks with signature verification using the
Next.js App Router.

## Prerequisites

- Node.js 18+
- A Trello Power-Up with an OAuth 1.0 application secret ([API Key tab](https://trello.com/power-ups/admin))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Trello application secret (`TRELLO_SECRET`) and the exact
   `TRELLO_CALLBACK_URL` you will register to `.env`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The webhook route lives at `app/webhooks/trello/route.ts` and handles:

- `HEAD` — answers Trello's creation validation check with `200`
- `POST` — receives and verifies webhook events

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 trello --path /webhooks/trello
```

The CLI prints a public URL. Register it as the `callbackURL` when you create the
Trello webhook, and set the same value as `TRELLO_CALLBACK_URL` so signatures verify.

### Run the tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/trello` - Receives and verifies Trello webhook events
- `HEAD /webhooks/trello` - Answers the Trello creation validation check with `200`
