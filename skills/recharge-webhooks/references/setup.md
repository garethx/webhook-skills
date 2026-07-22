# Setting Up Recharge Webhooks

## Prerequisites

- A Recharge merchant account with API access (an API token with the `write_webhooks` scope)
- Your application's webhook endpoint URL (must be HTTPS and publicly reachable)

## Get Your API Client Secret

Signature verification uses the **API Client Secret**, which is **different from the API access token**
you use to authenticate API requests.

1. In the Recharge merchant portal, go to **Tools and apps**.
2. Click **API tokens**.
3. Open your API token.
4. Copy the **API Client Secret**.

Store it as an environment variable:

```bash
# .env
RECHARGE_API_CLIENT_SECRET=your_api_client_secret_here
```

> The token you open here also provides the **API access token** (used as `X-Recharge-Access-Token`) for
> creating webhook subscriptions. Keep the two straight: the **access token** authenticates API calls;
> the **client secret** verifies webhook signatures.

## Register Your Endpoint (Admin API)

Recharge webhooks are created through the Admin API — there is no dashboard UI for them. Create **one
subscription per topic**, each pointing at your endpoint URL:

```bash
curl 'https://api.rechargeapps.com/webhooks' \
  -H 'X-Recharge-Version: 2021-11' \
  -H 'X-Recharge-Access-Token: your_api_token' \
  -H 'Content-Type: application/json' \
  -d '{
    "address": "https://your-app.com/webhooks/recharge",
    "topic": "charge/paid",
    "included_objects": ["customer"]
  }'
```

Fields:

- **`address`** (required) — the URL Recharge will `POST` payloads to.
- **`topic`** (required) — the event to subscribe to (e.g. `charge/paid`, `subscription/cancelled`).
- **`included_objects`** (optional) — extra related objects to embed in the payload (e.g. `["customer"]`).

Repeat for each topic you want to receive. API versions `2021-01` and `2021-11` share the same token
and topic names, so pick a version and set it via `X-Recharge-Version`.

### List and test webhooks

```bash
# List existing subscriptions
curl 'https://api.rechargeapps.com/webhooks' \
  -H 'X-Recharge-Version: 2021-11' \
  -H 'X-Recharge-Access-Token: your_api_token'

# Send a test event for an existing webhook (see the Test webhooks API reference)
curl -X POST 'https://api.rechargeapps.com/webhooks/{webhook_id}/test' \
  -H 'X-Recharge-Version: 2021-11' \
  -H 'X-Recharge-Access-Token: your_api_token'
```

## Response Requirements

- Respond with **`200`** within **5 seconds**.
- Any of: no response, `408`, `429`, or `5xx` is treated as a delivery failure.
- Failed deliveries are retried **20 times over 48 hours**, after which Recharge **deletes** the
  subscription. If a subscription disappears, check your endpoint's availability and latency, then
  re-create it.

## Test Webhooks Locally

Use the Hookdeck CLI to receive live webhooks on your machine (no account required):

```bash
npx hookdeck-cli listen 3000 recharge --path /webhooks/recharge
```

Register the tunnel URL Hookdeck prints as the `address` when creating your webhook subscription (or in
your Hookdeck connection), then trigger events in Recharge or use the Test webhooks API endpoint above.

## Full Documentation

- [Using webhooks](https://docs.getrecharge.com/docs/webhooks-overview)
- [Create a webhook](https://developer.rechargepayments.com/2021-11/webhooks_endpoints/webhooks_create)
- [Test webhooks](https://developer.rechargepayments.com/2021-11/webhooks_endpoints/webhooks_test)
