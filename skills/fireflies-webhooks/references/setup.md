# Setting Up Fireflies Webhooks

This covers **Webhooks V2**, the current scheme. Fireflies steers new webhook
creation to V2 and marks the V1 page as deprecated. The
[legacy V1 setup](#legacy-webhooks-v1-setup) is at the end for existing
integrations.

## Prerequisites

- A Fireflies.ai account with access to the Webhooks V2 configuration page (an
  API key is also required to call the GraphQL API when you fetch transcripts).
- Your application's webhook endpoint URL — **HTTPS is required**.
- The endpoint must accept `POST` and return a `2xx` within 10 seconds.

## Create the Webhook (V2)

1. Open the **Webhooks V2** configuration page in the Fireflies dashboard.
2. Enter your **HTTPS endpoint URL** (e.g. `https://your-app.com/webhooks/fireflies`).
3. Optionally add a **signing secret** (see below — strongly recommended).
4. **Select the events** you want delivered. Only subscribed events are sent.
5. Save.

### Selecting Events

V2 delivers three events, and you subscribe per webhook:

| `event` value | Triggered When |
|---------------|----------------|
| `meeting.transcribed` | A meeting has been processed and the transcript is ready |
| `meeting.summarized` | The AI summary for the meeting has been generated |
| `meeting.bot_joined` | The Fireflies notetaker bot joined a meeting |

Subscribe only to what you handle — it keeps the traffic down and makes an
unexpected event a real signal. Still branch defensively on `event` in your
handler so a future event type does not break existing behaviour.

### The Signing Secret Is Optional

Fireflies treats the signing secret as optional at setup. This matters:

> **If you do not set a signing secret, Fireflies sends no `X-Hub-Signature`
> header at all** — confirmed on a live test delivery. Your endpoint then has no
> way to prove a request came from Fireflies.

Set one in production. Any sufficiently random string works; V2 does not
document the 16–32 character limit that V1 enforced:

```bash
# 32 hex characters
openssl rand -hex 16
```

Copy the secret into your application as `FIREFLIES_WEBHOOK_SECRET`. Then decide
how your handler treats unsigned deliveries — see
[verification.md](verification.md#handling-unsigned-deliveries). The examples in
this skill warn loudly and accept when no secret is configured, and reject
unsigned or mis-signed deliveries whenever a secret *is* configured.

## Per-Upload Webhook (GraphQL)

When you upload audio programmatically, you can specify a webhook URL for that
upload's events via the `uploadAudio` mutation:

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
    "client_reference_id": "be582c46-4ac9-4565-9ba6-6ab4264496a8"
  }
}
```

The `client_reference_id` you provide is echoed back in the V2 webhook payload
as `client_reference_id` (same casing), so you can correlate the event with your
upload without storing a Fireflies-side mapping.

## Test Your Endpoint

1. Point the webhook URL at a public tunnel during development (see below).
2. Send a test delivery from the Webhooks V2 page, or record/upload a short meeting.
3. Confirm the request arrives, the signature verifies, and you return a `2xx`
   quickly.

A test delivery is a real POST with a real signature (when a secret is
configured), so it exercises your verification path.

## Local Development

For local webhook testing, use the Hookdeck CLI — no install or account required:

```bash
npx hookdeck-cli listen 3000 fireflies --path /webhooks/fireflies
```

Use the URL the CLI prints as your **webhook URL** on the Webhooks V2 page. The
CLI tunnels requests to your local server and gives you a web UI for inspecting
and replaying deliveries — useful for re-running a failed verification against
the exact original bytes.

## Environment Variables

```bash
# .env
FIREFLIES_WEBHOOK_SECRET=your_signing_secret
```

## Legacy: Webhooks V1 Setup

Only relevant for integrations already on V1. New webhooks should use V2.

V1 is configured globally rather than per-webhook:

1. Go to the Fireflies dashboard at **app.fireflies.ai/settings**.
2. Open the **Developer Settings** tab.
3. In the **Webhooks** section, set the **Webhook URL** to your HTTPS endpoint.
4. Enter a **custom secret key of 16–32 characters**, or click the refresh
   button to generate a random secret. Unlike V2, this secret is required.
5. Save. Fireflies POSTs a `Transcription completed` event to this URL each time
   a meeting finishes processing.

V1 has no event selection — it emits a single event type. Its payload uses
camelCase (`meetingId`, `eventType`, `clientReferenceId`), and the
`client_reference_id` passed to `uploadAudio` comes back as `clientReferenceId`.

## Full Documentation

- [Fireflies Webhooks V2](https://docs.fireflies.ai/graphql-api/webhooks-v2) — current scheme
- [Fireflies Webhooks (V1)](https://docs.fireflies.ai/graphql-api/webhooks) — legacy scheme
