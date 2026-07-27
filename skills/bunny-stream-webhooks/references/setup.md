# Setting Up Bunny Stream Webhooks

## Prerequisites

- A [Bunny.net](https://bunny.net/) account with a **Stream video library**
- Your application's public webhook endpoint URL (e.g. `https://your-app.com/webhooks/bunny-stream`)

## Get Your Signing Secret

Bunny Stream signs webhooks with the video library's **Read-Only API key** — there is no separate "webhook secret" to generate.

1. Go to the Bunny dashboard → **Stream** → select your **video library**.
2. Open **API** (or **Security / API Keys** depending on the dashboard version).
3. Copy the **Read-Only API key**. This is the value you set as `BUNNY_STREAM_WEBHOOK_SECRET`.

> The Read-Only key is used **only** to verify signatures. To fetch full video metadata after a webhook, you also need the library's read-write **AccessKey** for the Stream API — keep them as separate environment variables.

## Register Your Webhook URL

Webhooks are configured **per video library**:

1. In the dashboard, open your **video library**.
2. Go to the library's **Webhook** settings.
3. Set the **Webhook URL** to your endpoint (e.g. `https://your-app.com/webhooks/bunny-stream`).
4. Save. Bunny will now POST to this URL every time a video in the library changes state.

There is no per-event subscription UI — the library sends a callback for **every** status change. Filter on the `Status` field in your handler.

## Verify It Works

- Upload a short video to the library. As it processes, you should receive callbacks with `Status` values progressing toward `3` (Finished).
- Confirm your endpoint returns `200` for a valid signature and `401` for an invalid/missing one.

## Test Mode vs Live Mode

Bunny Stream has no separate test/live mode for webhooks. For local development, use the Hookdeck CLI to tunnel deliveries to your machine:

```bash
npx hookdeck-cli listen 3000 bunny-stream --path /webhooks/bunny-stream
```

Then set the Hookdeck URL as the library's Webhook URL and upload a test video.

## Retry Behavior

Bunny does not document a webhook retry policy. Design your handler to be **idempotent** (the same `Status` for a `VideoGuid` may arrive more than once) and to acknowledge quickly with a `200`, doing heavy work asynchronously.
