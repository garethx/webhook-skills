# Setting Up Wix Webhooks

## Prerequisites

- A Wix app in the [Custom Apps / app dashboard](https://manage.wix.com/account/custom-apps) (created in your Wix Studio workspace).
- A publicly reachable HTTPS endpoint for your webhook handler (for local development, use a tunnel — see below).

## Step 1 — Subscribe to a Webhook

1. Select your app on the [Custom Apps page](https://manage.wix.com/studio/custom-apps).
2. In the side menu, click **Webhooks**.
3. Click **+ Create Webhook**.
4. Select an **API Category** (e.g. **eCommerce**).
5. Choose a webhook event (e.g. **Order Canceled** → `wix.ecom.v1.order_canceled`).
6. Enter your server **Callback URL** — where Wix sends the event data (e.g. `https://your-domain.com/webhooks/wix`).
7. Add the relevant **Permissions** the event requires.
8. Click **Subscribe**.

Repeat for each event you want to receive. Webhooks are configured **per event**.

## Step 2 — Get Your Public Key

Webhook payloads are signed JWTs. Your **public key** verifies that a request genuinely came from Wix.

1. In your app, go to **Webhooks** and click **Get Public Key**, **or** open your app's home page → **More Actions** → **View ID & keys** and copy the public key.
2. Save the key securely. It's a per-app RSA public key in PEM format (`-----BEGIN PUBLIC KEY-----` … `-----END PUBLIC KEY-----`).

There is **no** global JWKS endpoint — the key is specific to your app.

## Step 3 — Get Your App ID

Find your **App ID** on the **OAuth** page of your app dashboard. The `@wix/sdk` `AppStrategy` needs it (`appId`).

## Step 4 — Configure Environment Variables

Store the App ID and public key as environment variables. Put the PEM key on one line using `\n` for newlines:

```bash
WIX_APP_ID=11111111-2222-3333-4444-555555555555
WIX_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhki...\n-----END PUBLIC KEY-----"
```

The examples convert the `\n` escapes back into real newlines before use. `@wix/sdk` also accepts a **base64-encoded** PEM string if you prefer a single unescaped line.

## Step 5 — Return 200 Quickly

Your handler **must return a `200`** response upon successful receipt, within **~1250 ms**. If you don't, Wix considers the delivery failed and retries (see below). Do slow work asynchronously and acknowledge fast.

## Testing Locally

Use a tunnel to receive live webhooks on your machine — no account required:

```bash
npx hookdeck-cli listen 3000 wix --path /webhooks/wix
```

Use the printed HTTPS URL (with the `/webhooks/wix` path) as your **Callback URL** in the app dashboard. The Webhooks page also has a **Logs** tab listing every webhook Wix has sent, which is useful for debugging.

## Versioning Note

Adding a webhook creates a new **minor version** of your app, pushed automatically to users on the latest major version. Sites on older major versions won't trigger newly added webhooks until they update. Encourage users to keep your app up to date.
