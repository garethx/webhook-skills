# Setting Up Walmart Webhooks

## Prerequisites

- A Walmart Marketplace **Seller Center** account with Developer/API access
- Marketplace API credentials (Client ID + Client Secret) to call the Webhooks Subscription API
- Your application's webhook endpoint URL — must be **HTTPS (TLS 1.2+)**

## 1. Set Up Your Performance Webhook Endpoint

1. Sign in to the [Walmart Developer Portal](https://developer.walmart.com/) and open the **Performance webhooks** documentation.
2. Follow [Set up your Performance webhook endpoint](https://developer.walmart.com/us-marketplace/docs/set-up-your-performance-webhook-endpoint) to register your HTTPS endpoint URL.
3. During setup you receive a **shared webhook secret**. Store it securely — it is the key used to compute and verify the `WM_SEC.SIGNATURE` HMAC-SHA256 signature.

```bash
# .env
WALMART_WEBHOOK_SECRET=your_webhook_secret_here
```

## 2. Discover Available Event Types

Call the [Get event types](https://developer.walmart.com/us-marketplace/docs/get-event-types) API to list every `eventType` you can subscribe to (each with a `resourceName` and `eventVersion`), for example:

- `PO_CREATED` (resource `ORDER`)
- `INVENTORY_OOS` (resource `INVENTORY`)
- `BUY_BOX_CHANGED` (resource `PRICE`)
- `RETURN_CREATED` (resource `ReturnsAndRefunds`)

Those four names are confirmed. Other event types documented elsewhere in this
skill (`OFFER_PUBLISHED`, `REPORT_STATUS`, `RETURN_DELIVERED`, and so on) are
illustrative and were not confirmed — **this API is the source of truth**, and
availability varies by account and program, so subscribe only to names it
actually returns for you.

## 3. Subscribe to Events

Use Walmart's **Webhooks Subscription API** to subscribe your registered endpoint to the event types you care about. See [Subscribe to an event notification](https://developer.walmart.com/documentation/subscribe-to-report-ready-notification/).

## 4. Verify Deliveries

Every delivery includes these headers (matched case-insensitively):

| Header | Meaning |
|--------|---------|
| `WM_SEC.TIMESTAMP` | Unix epoch **seconds** when the event was created |
| `WM_SEC.SIGNATURE` | Base64 HMAC-SHA256 signature |
| `WM_SEC.KEY_ID` | Optional — active secret id during rotation |

Verify the signature over the canonical string (see [verification.md](verification.md)) before trusting the payload.

## Secret Rotation

Walmart may rotate the webhook secret. During rotation, deliveries include `WM_SEC.KEY_ID` so you can identify which secret to verify against. Keep both the old and new secret active until all deliveries carry the new `WM_SEC.KEY_ID`.

## Test vs Production

- Register a test endpoint (e.g. a Hookdeck tunnel) and trigger events in Seller Center to validate your handler.
- For local testing, use the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 walmart --path /webhooks/walmart
```

## Note: Performance Webhooks vs Event Notifications

Walmart has two related mechanisms:

- **Performance webhooks** (this skill) — Walmart **signs the payload** with HMAC-SHA256 and you verify `WM_SEC.SIGNATURE`.
- **Event notifications** — you create a subscription (`eventType` + `resourceName` + `eventUrl`) and choose an `authMethod` (`BASIC_AUTH`, `HMAC` with a `clientSecret`, or `OAUTH`). Here Walmart **authenticates itself** to your endpoint using credentials **you** configured, rather than signing the payload. Retries follow a `5 min → 15 min → 45 min` schedule.

> Do **not** confuse either of these with the legacy `SHA256WithRSA` request-signing scheme (`WM_SEC.AUTH_SIGNATURE` / `WM_CONSUMER.*`) — that is how a **seller signs outbound calls to Walmart**, not how you verify inbound webhooks.

## Full Documentation

- [Notifications overview](https://developer.walmart.com/us-marketplace/docs/notifications-overview)
- [Set up your Performance webhook endpoint](https://developer.walmart.com/us-marketplace/docs/set-up-your-performance-webhook-endpoint)
- [Security and authenticity](https://developer.walmart.com/us-marketplace/docs/security-and-authenticity)
