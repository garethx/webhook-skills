# Setting Up Faundit Webhooks

## Prerequisites

- A Faundit account with API/webhook access
- Your application's publicly reachable webhook endpoint URL (e.g. `https://your-app.com/webhooks/faundit`)

## Get Your Signing Secret

The Faundit webhook signing secret is **not self-service** — you cannot generate it from a
dashboard. Request it from Faundit:

1. Email **tech@faundit.com** and ask for your webhook signing secret.
2. Store the secret securely (e.g. as `FAUNDIT_WEBHOOK_SECRET`); never commit it to source control.

You use the same secret to verify every incoming webhook.

## Register Your Endpoint

1. Provide Faundit with the URL of your webhook endpoint (via your Faundit contact / tech@faundit.com).
2. Faundit will deliver `item-status` and `request-status` events to that URL as a `POST`
   with a JSON body.

Faundit sends two signature headers with every delivery:

| Header | Scheme | Signed content | Use |
|--------|--------|----------------|-----|
| `X-Faundit-Signature-Next` | v1 (current) | `v1:<timestamp>:<body>` | **Prefer this** — verifies body integrity |
| `X-Faundit-Signature` | v0 (deprecated) | `v0:<timestamp>` | Avoid — no body integrity |
| `X-Faundit-Timestamp` | — | the timestamp value used above | Required to build the signed string |

## Testing

- Use a tunnel such as the Hookdeck CLI to receive events on your local machine:

  ```bash
  npx hookdeck-cli listen 3000 faundit --path /webhooks/faundit
  ```

- Trigger status changes on items/requests in your Faundit environment, or ask your Faundit
  contact to send a test delivery, and confirm your endpoint verifies the
  `X-Faundit-Signature-Next` header and returns `200`.

## Security Notes

- Always verify the `X-Faundit-Signature-Next` (v1) signature over the **raw** request body.
- Prefer the `-Next` header over the deprecated `X-Faundit-Signature` (v0), which does not
  cover the body and therefore provides no payload-tamper protection.
- Return `400`/`401` (and do not process) when verification fails.
