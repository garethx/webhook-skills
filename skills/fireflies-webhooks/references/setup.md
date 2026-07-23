# Setting Up Fireflies Webhooks

## Prerequisites

- A Fireflies.ai account with access to Developer Settings (an API key is
  required to call the GraphQL API when you fetch transcripts).
- Your application's webhook endpoint URL (HTTPS required).

## Get Your Signing Secret

Fireflies signs webhook deliveries with a secret you control. You can enter your
own or let Fireflies generate one.

1. Go to the Fireflies dashboard at **app.fireflies.ai/settings**.
2. Open the **Developer Settings** tab.
3. In the **Webhooks** section, enter a **custom secret key of 16–32 characters**,
   or click the refresh button to generate a random secret.
4. Copy the secret — you'll store it in your application as `FIREFLIES_WEBHOOK_SECRET`.

You can generate a suitable random secret locally:

```bash
# 32 hex characters
openssl rand -hex 16
```

## Register Your Endpoint

### Global Webhook (dashboard)

1. In **Settings → Developer Settings → Webhooks**, set the **Webhook URL** to
   your HTTPS endpoint (e.g. `https://your-app.com/webhooks/fireflies`).
2. Save. Fireflies will POST a `Transcription completed` event to this URL each
   time a meeting finishes processing.

### Per-Upload Webhook (GraphQL)

When you upload audio programmatically, you can specify a webhook URL for that
upload's completion event via the `uploadAudio` mutation:

```graphql
mutation UploadAudio($input: AudioUploadInput!) {
  uploadAudio(input: $input) {
    success
    title
    message
  }
}
```

```json
{
  "input": {
    "url": "https://example.com/meeting-recording.mp3",
    "title": "Q3 Planning Call",
    "webhook": "https://your-app.com/webhooks/fireflies",
    "client_reference_id": "your-optional-upload-reference"
  }
}
```

The `client_reference_id` you provide is echoed back in the webhook payload as
`clientReferenceId`, so you can correlate the completion event with your upload.

## Selecting Events

Fireflies currently emits a single event type — `Transcription completed` — so
there is no per-event subscription to configure. Your handler should read
`eventType` from the body and branch on it defensively so new event types don't
break existing behavior.

## Test Your Endpoint

1. Point the webhook URL at a public tunnel during development (see below).
2. Record or upload a short meeting.
3. When processing finishes, Fireflies POSTs the `Transcription completed` event
   to your endpoint.

## Local Development

For local webhook testing, use the Hookdeck CLI — no install or account required:

```bash
npx hookdeck-cli listen 3000 fireflies --path /webhooks/fireflies
```

Use the URL the CLI prints as your **Webhook URL** in Fireflies Developer
Settings. The CLI tunnels requests to your local server and gives you a web UI
for inspecting and replaying deliveries.

## Environment Variables

```bash
# .env
FIREFLIES_WEBHOOK_SECRET=your_16_to_32_char_secret
```

## Full Documentation

For complete setup instructions, see [Fireflies Webhooks](https://docs.fireflies.ai/graphql-api/webhooks).
