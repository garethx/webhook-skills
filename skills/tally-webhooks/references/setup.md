# Setting Up Tally Webhooks

## Prerequisites

- A Tally account with a published form
- Your application's webhook endpoint URL (publicly reachable, HTTPS)

Webhooks are **free on all Tally plans**.

## Add a Webhook

1. Open your form in Tally.
2. Go to the **Integrations** tab.
3. Find **Webhooks** and click **Connect**.
4. Enter your endpoint URL (e.g. `https://your-app.com/webhooks/tally`).
5. Save. Tally will POST a `FORM_RESPONSE` event to this URL on every submission.

You can add multiple webhook endpoints per form.

## Get Your Signing Secret

Signing is **optional** but strongly recommended so you can verify that requests genuinely came
from Tally.

1. In the same **Integrations → Webhooks** configuration for your form, set a **Signing secret**.
2. Copy the secret and store it as an environment variable in your app:

   ```bash
   TALLY_SIGNING_SECRET=your_signing_secret
   ```

When a signing secret is set, Tally adds a `Tally-Signature` header to every request. The header
value is `base64(HMAC-SHA256(signingSecret, rawJsonBody))`. See
[verification.md](verification.md) for how to validate it.

> If you use the Tally API to manage webhooks, the signing secret is the `signingSecret` field.

### Unsigned webhooks

If you do **not** set a signing secret, requests arrive **without** a `Tally-Signature` header —
they are unsigned and cannot be cryptographically verified. Set a signing secret for any
production endpoint, and have your handler reject unsigned/invalid requests when a secret is
configured.

## Delivery, Timeout, and Retries

- Your endpoint must respond with a **2XX** status within a **10-second** timeout.
- If a delivery fails (non-2XX or timeout), Tally retries on this schedule:
  **5 minutes → 30 minutes → 1 hour → 6 hours → 1 day**.
- Acknowledge fast (return 200 immediately) and process slow work asynchronously so you stay
  inside the timeout and avoid unnecessary retries.

## Test Your Endpoint

1. Start your handler locally and expose it with the Hookdeck CLI (no account required):

   ```bash
   npx hookdeck-cli listen 3000 tally --path /webhooks/tally
   ```

2. Put the tunnel URL into the form's webhook configuration (or point Hookdeck at your endpoint).
3. Submit the form. A `FORM_RESPONSE` event should hit your handler; inspect the request in the
   Hookdeck web UI.
