# Setting Up TikTok Shop Webhooks

## Prerequisites

- A [TikTok Shop Partner Center](https://partner.tiktokshop.com/) developer
  account with an app created.
- Your app's **`app_key`** and **`app_secret`** (App details page). The
  `app_secret` is used to verify webhook signatures — keep it secret.
- A public **HTTPS** endpoint on a domain: **no IP address, no custom port**,
  **TLS 1.2+**. It must respond `200` with an empty body within **3 seconds**.

## Get Your App Key and Secret

1. Go to **Partner Center → Manage apps → your app**.
2. Copy the **App key** and **App secret** from the app's basic information.
3. Store them as environment variables:

   ```bash
   TIKTOK_SHOP_APP_KEY=your_app_key
   TIKTOK_SHOP_APP_SECRET=your_app_secret
   ```

## Register Your Endpoint (Dashboard)

1. In Partner Center, open **App & Service → your app → Basic Information**.
2. Under the **Developing** section, set the **Webhook URL** to your public
   HTTPS endpoint (e.g. `https://api.example.com/webhooks/tiktok-shop`).
3. Under **Event subscriptions**, select the events you want to receive
   (e.g. `ORDER_STATUS_CHANGE`, `PACKAGE_UPDATE`, `RECIPIENT_ADDRESS_UPDATE`,
   `PRODUCT_STATUS_CHANGE`, `SELLER_DEAUTHORIZATION`).
4. Save. TikTok validates the endpoint is reachable over HTTPS.

## Register Your Endpoint (Events API)

You can manage subscriptions programmatically against the Events API base
`https://open-api.tiktokglobalshop.com/event/202309/webhooks`:

- **`PUT /event/202309/webhooks`** — create/update a subscription (address +
  event type)
- **`GET /event/202309/webhooks`** — list current subscriptions
- **`DELETE /event/202309/webhooks`** — remove a subscription

These calls are authenticated with TikTok Shop's standard API request signing
(app_key, access token, and the `sign` query parameter) — that is a **different**
signing scheme from the webhook `Authorization` header your receiver verifies.

## Test Mode vs Live

TikTok Shop does not have a separate webhook test secret — the same `app_secret`
signs test and live traffic. To exercise your handler:

- Use the **API testing tool** in Partner Center's Development kits to trigger
  sample events.
- Perform a real action in a sandbox/test shop (e.g. move an order's status) and
  watch the delivery.
- Locally, tunnel with the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 tiktok-shop --path /webhooks/tiktok-shop
  ```

## Checklist

- [ ] Endpoint is HTTPS on a domain (no IP, no custom port), TLS 1.2+
- [ ] Responds `200` with empty body within 3 seconds
- [ ] Verifies the `Authorization` header signature before processing
- [ ] Returns `401` when the signature does not match
- [ ] Dedupes on `tts_notification_id` (delivery is at-least-once)
- [ ] Has a polling reconciliation job for missed events
