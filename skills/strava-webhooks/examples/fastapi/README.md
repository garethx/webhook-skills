# Strava Webhooks - FastAPI Example

Minimal example of receiving Strava webhooks with the subscription validation
handshake using FastAPI (Strava events are **not** signed).

## Prerequisites

- Python 3.9+
- A Strava API application (Client ID + Client Secret) from
  <https://www.strava.com/settings/api>
- A verify token (any random string you choose)

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `STRAVA_VERIFY_TOKEN` (and optionally `STRAVA_SUBSCRIPTION_ID`) in `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

- `GET /webhooks/strava` — subscription validation handshake
- `POST /webhooks/strava` — receives Strava events

## Test

### 1. Expose your endpoint

```bash
npx hookdeck-cli listen 8000 strava --path /webhooks/strava
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
pytest test_webhook.py -v
```

## Endpoints

- `GET /webhooks/strava` - Subscription validation handshake
- `POST /webhooks/strava` - Receives Strava webhook events
