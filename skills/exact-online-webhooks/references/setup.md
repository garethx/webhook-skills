# Setting Up Exact Online Webhooks

## Prerequisites

- An Exact Online account with access to the [App Center](https://apps.exactonline.com/)
- A registered OAuth app (Exact Online webhooks require OAuth2)
- Your application's public webhook endpoint URL (HTTPS)

## 1. Register an OAuth App and Get the Webhook Secret

1. Go to the Exact **App Center** and register (or open) your app.
2. In the app registration you get an OAuth **Client ID** and **Client Secret**
   (used for the OAuth2 token flow) and a separate **Webhook secret**.
3. Copy the **Webhook secret** — this is what signs the `HashCode`. It is **not**
   the OAuth client secret. Store it as `EXACT_WEBHOOK_SECRET`.

> If you rotate the Webhook secret in the App Center, update `EXACT_WEBHOOK_SECRET`
> or every delivery will fail verification.

## 2. Get an OAuth2 Access Token

Webhook subscriptions are created with an authenticated call, and enriching the
thin payload also needs a token. Exact uses the OAuth2 authorization code grant:

1. Redirect the user to Exact's authorize endpoint and obtain an authorization code.
2. Exchange the code for an `access_token` (valid ~10 minutes) and a
   `refresh_token` at the token endpoint.
3. Refresh the access token as needed.

See the [Exact Online OAuth documentation](https://support.exactonline.com/community/s/article/All-All-DNO-Content-oauth-eol)
for the full flow. Access tokens are per **division** (company).

## 3. Subscribe to a Topic

Create one subscription per topic, per division, via the REST API:

```http
POST https://start.exactonline.nl/api/v1/{division}/webhooks/WebhookSubscriptions
Authorization: Bearer {access_token}
Content-Type: application/json
Accept: application/json

{
  "Topic": "Accounts",
  "CallbackURL": "https://your-app.example.com/webhooks/exact-online"
}
```

- `Topic` — one of the supported topics (e.g. `Accounts`, `Items`,
  `StockPositions`, `FinancialTransactions`, `GoodsDeliveries`, `Contacts`).
- `CallbackURL` — your public HTTPS endpoint. Exact validates it during creation,
  so your endpoint must already be reachable and return 2xx.
- Only **one subscription per topic per app per division** is allowed.

To receive near-instant `GoodsDeliveries`, include the `IsInstant` flag when
supported for that topic.

List or delete subscriptions with `GET` / `DELETE` on the same
`WebhookSubscriptions` resource.

> Endpoint region: use the base URL for your account's region (e.g.
> `start.exactonline.nl`, `start.exactonline.co.uk`, `start.exactonline.de`).

## 4. Verify Deliveries

Exact POSTs `{"Content":{…},"HashCode":"<hex>"}` to your `CallbackURL`. Your
handler must:

1. Read the **raw body** (do not let a JSON parser touch it first).
2. Compute HMAC-SHA256 over the raw `Content` JSON, keyed with the Webhook
   secret, hex-encoded and **uppercased**, and compare to `HashCode`.
3. Return **200** quickly. Exact retries deliveries that don't get a 2xx.

See [verification.md](verification.md) for the exact algorithm and gotchas.

## Test Mode vs Live Mode

Exact Online has no separate webhook "test mode". To test locally:

1. Start a tunnel: `npx hookdeck-cli listen 3000 exact-online --path /webhooks/exact-online`
2. Register the tunnel URL as the `CallbackURL`.
3. Make a change to a subscribed entity (e.g. edit an account) in Exact Online
   and watch the delivery arrive.
