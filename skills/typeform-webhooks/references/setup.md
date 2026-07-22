# Setting Up Typeform Webhooks

## Prerequisites

- A Typeform account and a published form
- Your application's webhook endpoint URL (must be **HTTPS** with a valid certificate)
- For the API method: a [personal access token](https://www.typeform.com/developers/get-started/personal-access-token/)

## Option A: Configure in the Typeform UI

1. Open your form in the Typeform builder.
2. Go to the **Connect** panel → **Webhooks**.
3. Click **Add a webhook** and paste your endpoint URL (must start with `https://`).
4. Toggle the webhook **on**.
5. Click **Edit** → **Add a Secret** and paste a randomly generated secret string.
   Save the same value as `TYPEFORM_WEBHOOK_SECRET` in your app.

> Adding a secret is what enables the `Typeform-Signature` header. If you don't set
> a secret, Typeform will not send the header and you cannot verify authenticity.

## Option B: Configure via the Webhooks API

Create or update a webhook with `PUT /forms/{form_id}/webhooks/{tag}`. The `{tag}`
is a label you choose to identify this webhook.

```bash
curl -X PUT "https://api.typeform.com/forms/{form_id}/webhooks/{tag}" \
  -H "Authorization: Bearer $TYPEFORM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/typeform",
    "enabled": true,
    "secret": "your_generated_secret",
    "verify_ssl": true
  }'
```

| Field | Description |
|-------|-------------|
| `url` | Your HTTPS endpoint. |
| `enabled` | `true` to activate delivery. |
| `secret` | Signing secret used to compute the `Typeform-Signature` header. |
| `verify_ssl` | `true` to require a valid SSL certificate on your endpoint. |

To manage webhooks programmatically from Node, the official
[`@typeform/api-client`](https://www.npmjs.com/package/@typeform/api-client)
exposes `client.webhooks.create/get/update/delete`. Note: this SDK is for
**managing** webhooks — it does **not** verify signatures. Verify manually (see
[verification.md](verification.md)).

## Choosing Events

Typeform delivers `form_response` on every completed submission. To also receive
`form_response_partial`, enable **partial submit points** on the form (this feature
may be plan-gated). There is no per-event subscription list — the events you receive
depend on the form's configuration.

## Testing Your Webhook

- Submit a test response to the form to trigger a real `form_response` delivery.
- Use the Webhooks API `GET /forms/{form_id}/webhooks/{tag}` to inspect status.
- For local development, tunnel to your machine over HTTPS:

  ```bash
  npx hookdeck-cli listen 3000 typeform --path /webhooks/typeform
  ```

  Point the webhook `url` at the HTTPS tunnel URL the CLI prints.
