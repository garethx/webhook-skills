# Setting Up TikTok Webhooks

## Prerequisites

- A [TikTok for Developers](https://developers.tiktok.com/) account with a
  registered app (client key + client secret provisioned).
- Your app added to one of the products that emit webhooks (Login Kit, Content
  Posting API / Video Kit, or Data Portability API).
- A **publicly reachable HTTPS** endpoint for your webhook handler. Plain HTTP is
  rejected; use a tunnel (see below) for local development.

## Get Your Signing Secret

TikTok signs webhooks with your app's **client secret** — there is no separate
webhook secret.

1. Go to the [TikTok for Developers](https://developers.tiktok.com/) portal.
2. Open **Manage apps** → your app.
3. Under **Basic information**, copy the **Client secret**.
4. Store it as `TIKTOK_CLIENT_SECRET` in your app's environment.

Keep the client secret private — it both authorizes your OAuth calls and verifies
your webhooks.

## Register Your Callback URL

1. In the developer portal, open your app.
2. Find the **Webhooks** configuration (available during initial app creation or
   later by editing the app).
3. Set the **Callback URL** to your handler, e.g.
   `https://yourdomain.com/webhooks/tiktok`. It **must be HTTPS**.
4. **Subscribe to events** you care about:
   - `authorization.removed`
   - `video.upload.failed`
   - `video.publish.completed`
   - `portability.download.ready`
5. Save. TikTok begins delivering `POST` requests to the callback URL.

Your endpoint must respond with a `200` HTTP status quickly. Non-200 responses
cause TikTok to retry for up to 72 hours with exponential backoff.

## Local Development

Use the Hookdeck CLI to receive real deliveries on your machine without deploying
(no account required — a guest account and tunnel are created on first run):

```bash
npx hookdeck-cli listen 3000 tiktok --path /webhooks/tiktok
```

FastAPI listens on port 8000:

```bash
npx hookdeck-cli listen 8000 tiktok --path /webhooks/tiktok
```

Register the printed public HTTPS URL (with `/webhooks/tiktok` appended) as your
callback URL in the developer portal, then trigger an event (e.g. deauthorize the
app, or publish a video via the Content Posting API) and watch it arrive.

## Test Mode vs Live Mode

TikTok does not offer a separate webhook "test mode". To exercise your handler:

- **Locally**, generate a signed request yourself using HMAC-SHA256 over
  `"<timestamp>.<raw_body>"` keyed with your client secret (see the example
  tests), or replay a captured delivery through the Hookdeck CLI.
- **End to end**, perform the real action (deauthorize the app, publish a video,
  request a data export) against your app in the sandbox/development state.
