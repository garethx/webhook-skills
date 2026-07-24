# Setting Up ShipHero Webhooks

## Prerequisites

- A ShipHero account with API access
- A ShipHero GraphQL API access token (from the API section of Settings, or via
  the [auth flow](https://developer.shiphero.com/getting-started/))
- Your application's webhook endpoint URL (must be HTTPS and publicly reachable)

## How Registration Works

ShipHero webhooks are registered through the **GraphQL API** — there is no
dashboard toggle for arbitrary event subscriptions. You register **one webhook
per event type** using the `webhook_create` mutation. Each registration returns
a `shared_signature_secret` that you use to verify that webhook's deliveries.

## Register a Webhook (`webhook_create`)

Send this mutation to `https://public-api.shiphero.com/graphql` with your access
token in the `Authorization: Bearer <token>` header:

```graphql
mutation {
  webhook_create(
    data: {
      name: "Order Allocated"
      url: "https://your-app.com/webhooks/shiphero"
      shop_name: "my-integration"
    }
  ) {
    request_id
    complexity
    webhook {
      id
      name
      url
      shop_name
      shared_signature_secret
    }
  }
}
```

Parameters:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | The **exact** webhook type string, Title Case (e.g. `Order Allocated`, `Shipment Update`, `Inventory Update`). |
| `url` | Yes | Your HTTPS endpoint that will receive the POST. |
| `shop_name` | Yes | An identifier for this webhook instance (your integration/shop name). |

> **Save the secret**: `shared_signature_secret` is returned **only once**, at
> creation. Store it as `SHIPHERO_WEBHOOK_SECRET`. If you lose it, delete the
> webhook and recreate it.

Register a separate webhook for each event type you want (`Shipment Update`,
`Inventory Update`, `Order Canceled`, etc.). Point them all at the same endpoint
and dispatch on the payload's `webhook_type` field.

## List and Delete Webhooks

```graphql
# List existing webhooks
query {
  webhooks {
    data {
      edges {
        node { id name url shop_name }
      }
    }
  }
}

# Delete a webhook by name
mutation {
  webhook_delete(data: { name: "Order Allocated" }) {
    request_id
  }
}
```

## Test Mode vs Production

ShipHero has no separate webhook sandbox — webhooks fire from real fulfillment
activity in your account. To test locally, tunnel your endpoint with the
Hookdeck CLI and register the tunnel URL as the webhook `url`:

```bash
npx hookdeck-cli listen 3000 shiphero --path /webhooks/shiphero
```

Then trigger the corresponding action in ShipHero (allocate an order, create a
shipment, etc.) to receive a live delivery.

> **Note**: ShipHero does not queue events while a webhook is disabled — events
> fired during a downtime window are discarded, not replayed. Keep your endpoint
> reachable, and consider a durable ingestion layer (see
> [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway)).

## Environment Variables

```bash
# .env
SHIPHERO_WEBHOOK_SECRET=your_shared_signature_secret_here
```

## Full Documentation

- [ShipHero Webhooks](https://developer.shiphero.com/webhooks/)
- [Webhook Verification](https://developer.shiphero.com/webhooks/#webhook_verification)
- [ShipHero GraphQL API](https://developer.shiphero.com/getting-started/)
