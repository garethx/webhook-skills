# Setting Up Strava Webhooks

## Prerequisites

- A Strava API application (create one at <https://www.strava.com/settings/api>).
  Note its **Client ID** and **Client Secret**.
- A publicly reachable HTTPS callback URL (use the [Hookdeck CLI](#local-development)
  or a tunnel during development).
- A **verify token** — any random string you choose. You will store it in your
  app and Strava will echo it back during validation.

Strava webhooks have no dashboard toggle. Subscriptions are managed entirely
through the `push_subscriptions` REST endpoint.

## Environment Variables

```bash
STRAVA_CLIENT_ID=12345                 # Strava API application ID
STRAVA_CLIENT_SECRET=xxxxxxxx          # Strava API application secret
STRAVA_VERIFY_TOKEN=your_random_token  # Any string you choose; echoed during validation
STRAVA_SUBSCRIPTION_ID=120475          # Optional: set after creating the subscription
```

## Step 1 — Deploy Your Callback Endpoint First

Strava validates the callback **synchronously** during subscription creation, so
your endpoint must be live and reachable *before* you make the POST below. It must
handle a `GET /webhooks/strava` request (the validation handshake) and return the
`hub.challenge` within 2 seconds. See [verification.md](verification.md).

## Step 2 — Create the Subscription

`POST` to the push subscriptions endpoint with form fields:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=$STRAVA_CLIENT_ID \
  -F client_secret=$STRAVA_CLIENT_SECRET \
  -F callback_url=https://your-domain.com/webhooks/strava \
  -F verify_token=$STRAVA_VERIFY_TOKEN
```

| Field | Description |
|-------|-------------|
| `client_id` | Your Strava API application ID |
| `client_secret` | Your Strava API application secret |
| `callback_url` | Your endpoint; **max 255 characters** |
| `verify_token` | The random string you chose (must match what your endpoint checks) |

On success Strava returns the subscription ID:

```json
{ "id": 120475 }
```

Store this as `STRAVA_SUBSCRIPTION_ID` so your handler can (optionally) reject
events from any other subscription.

> **Only one subscription per application.** If one already exists, creation
> fails — view or delete it first (steps below).

## Step 3 — View the Existing Subscription

```bash
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=$STRAVA_CLIENT_ID \
  -d client_secret=$STRAVA_CLIENT_SECRET
```

## Step 4 — Delete a Subscription

```bash
curl -X DELETE "https://www.strava.com/api/v3/push_subscriptions/$STRAVA_SUBSCRIPTION_ID" \
  -d client_id=$STRAVA_CLIENT_ID \
  -d client_secret=$STRAVA_CLIENT_SECRET
```

A successful delete returns `204 No Content`.

## Local Development

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 strava --path /webhooks/strava
```

Use the printed HTTPS URL as your `callback_url` when creating the subscription.
Strava will immediately issue the validation `GET`; watch the Hookdeck request
inspector to confirm your endpoint echoed `hub.challenge` with a `200`.

## Testing Events

After validation, trigger a real event by recording, editing, or deleting an
activity on a Strava account that has authorized your application. Strava will
`POST` the event to your callback. There is no synthetic "test event" button —
events come from real athlete actions.

## Common Setup Errors

| Symptom | Cause |
|---------|-------|
| `{"errors":[{"resource":"PushSubscription","field":"callback url","code":"not verifiable"}]}` | Your endpoint didn't return `200` with the correct `hub.challenge` JSON in time |
| Subscription creation rejected | A subscription already exists (one per app) — view/delete it first |
| Validation `GET` never arrives | `callback_url` unreachable, not HTTPS, or over 255 chars |
| `hub.verify_token` mismatch → `403` | `STRAVA_VERIFY_TOKEN` differs from the `verify_token` you POSTed |
