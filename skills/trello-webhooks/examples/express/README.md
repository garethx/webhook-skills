# Trello Webhooks - Express Example

Minimal example of receiving Trello webhooks with signature verification.

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
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 trello --path /webhooks/trello
```

The CLI prints a public URL. Register it as the `callbackURL` when you create the
Trello webhook, and set the same value as `TRELLO_CALLBACK_URL` so signatures verify.

### Create a webhook

```bash
curl -X POST "https://api.trello.com/1/tokens/{token}/webhooks/" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "YOUR_API_KEY",
    "callbackURL": "https://YOUR_TUNNEL_URL/webhooks/trello",
    "idModel": "ID_OF_BOARD_CARD_OR_LIST",
    "description": "My webhook"
  }'
```

Trello sends a `HEAD` request to the callback URL at creation — this example answers
it with `200` so creation succeeds.

### Run the tests

```bash
npm test
```

## Endpoints

- `HEAD /webhooks/trello` - Answers the Trello creation validation check with `200`
- `POST /webhooks/trello` - Receives and verifies Trello webhook events
- `GET /health` - Health check
