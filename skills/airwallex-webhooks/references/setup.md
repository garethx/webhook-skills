# Setting Up Airwallex Webhooks

## Prerequisites

- An Airwallex account with access to the web app (Admin/Developer permissions)
- Your application's webhook endpoint URL, served over **HTTPS** (Airwallex
  rejects plain HTTP endpoints)

## Register Your Endpoint & Get the Secret

1. Log in to the [Airwallex web app](https://www.airwallex.com/app/login).
2. Go to **Settings → Developer → Webhooks**.
3. Click **Add webhook** (or **Create**).
4. Enter your endpoint URL, e.g. `https://api.yourapp.com/webhooks/airwallex`.
5. Select the events you want to receive (or subscribe to all events).
6. Save. Airwallex generates a **unique secret key for this webhook URL**.
7. Copy the secret and store it as `AIRWALLEX_WEBHOOK_SECRET` in your app's
   environment. **Each webhook URL has its own secret** — if you add more than one
   endpoint, each one gets a distinct secret.

You can return to the same screen later to reveal the secret again, edit the
subscribed events, or delete the endpoint.

## Environment Variable

```bash
AIRWALLEX_WEBHOOK_SECRET=whsec_xxxxx   # the secret for THIS webhook URL
```

## Test Events

- Use the **Send test event** / re-trigger option in the Webhooks screen to send
  a sample payload to your endpoint.
- Test events include the same `x-timestamp` and `x-signature` headers, so your
  verification code runs unchanged. For test events, the secret is delivered in
  the `client-secret-key` header of the test request.
- You can also re-send any real past event from the web app to debug your
  handler.

## IP Allowlisting

If your infrastructure restricts inbound traffic, allow Airwallex's published
webhook source IP addresses so deliveries are not blocked. The current IP list
is in the
[Airwallex webhooks documentation](https://www.airwallex.com/docs/developer-tools/webhooks/webhooks-overview).
Do **not** rely on source IP alone for authentication — always verify the
`x-signature` (see [verification.md](verification.md)).

## Local Development

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 airwallex --path /webhooks/airwallex
```

This gives you a public HTTPS URL to register in the Airwallex web app plus a web
UI to inspect and replay requests. Use `8000` as the port for the FastAPI example.
