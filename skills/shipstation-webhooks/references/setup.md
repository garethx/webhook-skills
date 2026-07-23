# Setting Up ShipStation Webhooks

## Prerequisites

- A ShipStation account with API access (V1 API, `ssapi.shipstation.com`)
- Your application's webhook endpoint URL, served over **HTTPS**
- An unguessable secret string to embed in the endpoint URL (there is no signing secret in V1)

## Get Your API Credentials

ShipStation V1 has **no webhook signing secret**. The credentials you need are the API key/secret,
which you use to fetch the `resource_url` sent in each webhook:

1. Log in to ShipStation.
2. Go to **Settings → Account → API Settings**.
3. Copy your **API Key** and **API Secret** (generate a key pair if none exists).

These become `SHIPSTATION_API_KEY` and `SHIPSTATION_API_SECRET` in your app.

## Choose a Secret Token for the Endpoint

Because V1 does not sign requests, secure your endpoint by embedding an unguessable token in the
target URL and validating it on every request:

```
https://your-app.com/webhooks/shipstation?token=<SHIPSTATION_WEBHOOK_SECRET>
```

Generate a strong random value (e.g. `openssl rand -hex 32`) and store it as
`SHIPSTATION_WEBHOOK_SECRET`. Your handler compares the incoming `?token=` against it timing-safe.

## Register Your Endpoint

You can subscribe either through the API or the dashboard.

### Option A — API (`POST /webhooks/subscribe`)

`POST https://ssapi.shipstation.com/webhooks/subscribe` with Basic auth (API key : API secret) and a
JSON body:

```bash
curl -X POST https://ssapi.shipstation.com/webhooks/subscribe \
  -u "$SHIPSTATION_API_KEY:$SHIPSTATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "https://your-app.com/webhooks/shipstation?token=YOUR_SECRET",
    "event": "SHIP_NOTIFY",
    "friendly_name": "Ship notifications",
    "store_id": null
  }'
```

Body fields:

| Field | Required | Description |
|-------|----------|-------------|
| `target_url` | Yes | Your HTTPS endpoint, including the `?token=` secret |
| `event` | Yes | One of `ORDER_NOTIFY`, `ITEM_ORDER_NOTIFY`, `SHIP_NOTIFY`, `ITEM_SHIP_NOTIFY`, `FULFILLMENT_SHIPPED`, `FULFILLMENT_REJECTED` |
| `store_id` | No | Limit the subscription to a single store; `null`/omit for all stores |
| `friendly_name` | No | A label shown in ShipStation |

Subscribe once per event you want to receive.

### Option B — Dashboard (UI)

1. Go to **Settings → Integrations → Webhooks**.
2. Click **Add a Webhook**.
3. Choose the event (On Order Notification, On Ship Notification, etc.), enter your
   `target_url` (including the `?token=` secret), and optionally scope it to a store.
4. Save.

## List and Delete Subscriptions

```bash
# List existing subscriptions
curl -u "$SHIPSTATION_API_KEY:$SHIPSTATION_API_SECRET" \
  https://ssapi.shipstation.com/webhooks

# Delete one by id
curl -X DELETE -u "$SHIPSTATION_API_KEY:$SHIPSTATION_API_SECRET" \
  https://ssapi.shipstation.com/webhooks/{webhookId}
```

## Test Your Endpoint

- Trigger a real event (import or ship an order), or resend from the Webhooks settings page.
- For local development, tunnel with the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 shipstation --path /webhooks/shipstation
  ```

  Use the generated HTTPS URL (with your `?token=`) as the `target_url` when subscribing.

## Notes

- Deliveries are **thin**: expect only `resource_url` and `resource_type`. Fetch `resource_url`
  (Basic auth) for the actual data.
- The V1 fetch API is rate limited to **40 requests/minute per key** (`429` + `X-Rate-Limit-Reset`).
