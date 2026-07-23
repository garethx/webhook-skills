# Strava Webhooks - Next.js Example

Minimal example of receiving Strava webhooks with the subscription validation
handshake using the Next.js App Router (Strava events are **not** signed).

## Prerequisites

- Node.js 18+
- A Strava API application (Client ID + Client Secret) from
  <https://www.strava.com/settings/api>
- A verify token (any random string you choose)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `STRAVA_VERIFY_TOKEN` (and optionally `STRAVA_SUBSCRIPTION_ID`) in `.env.local`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

- `GET /webhooks/strava` — subscription validation handshake
- `POST /webhooks/strava` — receives Strava events

## Test

### 1. Expose your endpoint

```bash
npx hookdeck-cli listen 3000 strava --path /webhooks/strava
```

### 2. Create the subscription (triggers validation)

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=$STRAVA_CLIENT_ID \
  -F client_secret=$STRAVA_CLIENT_SECRET \
  -F callback_url=https://<your-tunnel-url>/webhooks/strava \
  -F verify_token=$STRAVA_VERIFY_TOKEN
```

Strava immediately issues the validation `GET`; your endpoint echoes
`hub.challenge` and Strava returns the subscription `id`.

### 3. Trigger events

Record, edit, or delete an activity on an athlete account that has authorized your
app. Strava has no synthetic test event — events come from real athlete actions.

### Run the unit tests

```bash
npm test
```

## Endpoints

- `GET /webhooks/strava` - Subscription validation handshake
- `POST /webhooks/strava` - Receives Strava webhook events
