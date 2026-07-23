# Setting Up Twitter / X Webhooks

## Prerequisites

- An **approved X developer account** with **Account Activity API** access
  (Pay-Per-Use or Enterprise tier).
- An **App** in the X Developer Portal with:
  - **Consumer keys** — the **API Key** and **API Secret Key** (the *consumer
    secret* used for signing).
  - **OAuth2 App-Only Bearer Token** — used to call the V2 Webhooks API.
  - **OAuth 1.0a** user-context tokens — used to create per-user subscriptions.
- A **public HTTPS endpoint** with **no port in the URL** that responds within
  **10 seconds**.

## Get Your Consumer Secret

1. Go to the [X Developer Portal](https://developer.x.com/) → your Project → your App.
2. Open **Keys and tokens**.
3. Copy the **API Key** and **API Secret Key**. The **API Secret Key** is your
   **consumer secret** — this is the HMAC key for both CRC responses and POST
   signature verification.

Set it as an environment variable:

```bash
TWITTER_CONSUMER_SECRET=your_api_secret_key
```

> Use the **consumer secret**, not the Bearer Token or a user access token.

## Register Your Webhook (V2 Webhooks API)

Registration uses **OAuth2 App-Only Bearer auth**.

```bash
curl -X POST "https://api.x.com/2/webhooks" \
  -H "Authorization: Bearer $APP_ONLY_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhooks/twitter"}'
```

On registration, X immediately sends a **CRC check** (a `GET` with a
`crc_token`) to the URL. Your endpoint must answer correctly or registration
fails.

## Pass the CRC (Challenge-Response Check)

X sends `GET https://your-domain.com/webhooks/twitter?crc_token=<token>`:

- **at registration**,
- **roughly hourly**,
- **on demand** (calling `PUT /2/webhooks/:webhook_id` triggers one).

Respond within the timeout with:

```json
{ "response_token": "sha256=<base64 HMAC-SHA256(consumer_secret, crc_token)>" }
```

If you return a non-2xx status **or an incorrect `response_token`**, the webhook
is marked **invalid** and delivery stops until it passes again. See
[verification.md](verification.md) for the exact computation.

## Subscribe a User

Registering a webhook does not deliver anything on its own — you must subscribe
each user (using their **OAuth 1.0a user context** tokens):

```bash
curl -X POST \
  "https://api.x.com/2/account_activity/webhooks/$WEBHOOK_ID/subscriptions/all" \
  --header "Authorization: OAuth ..."   # OAuth 1.0a user context
```

Now activity for that user is delivered to your endpoint as POST events.

## Testing Locally

Use the Hookdeck CLI to receive events on your machine without deploying:

```bash
npx hookdeck-cli listen 3000 twitter --path /webhooks/twitter
```

Register the printed HTTPS URL with `POST /2/webhooks`. Hookdeck forwards both
the CRC `GET` and event `POST` requests to your local server so you can verify
the full handshake.

## Tiers & Limits

| Tier | Webhooks | Subscriptions |
|------|----------|---------------|
| Pay-Per-Use | 1 | 3 |
| Enterprise | 5+ | 5000+ |
