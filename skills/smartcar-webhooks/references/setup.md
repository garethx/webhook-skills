# Setting Up Smartcar Webhooks

## Prerequisites

- A [Smartcar Dashboard](https://dashboard.smartcar.com) account with an
  application
- Your application's publicly reachable, HTTPS webhook endpoint URL (e.g.
  `https://your-app.com/webhooks/smartcar`)

## Get Your Application Management Token

The **Application Management Token** (AMT, sometimes called the Management API
Token / MAT) is the single secret used to verify webhook signatures **and** to
answer the VERIFY challenge — it keys every HMAC.

1. Go to the [Smartcar Dashboard](https://dashboard.smartcar.com).
2. Select your application.
3. Open **Configuration → Management API Token** (or **Webhooks → Management
   Token**).
4. Copy the token and store it as `SMARTCAR_MANAGEMENT_TOKEN` in your
   environment. Treat it like a password — anyone with it can forge valid
   signatures.

## Register Your Webhook

1. In the Dashboard, go to **Webhooks → Create Webhook**.
2. Enter your **Callback URI** — the public HTTPS URL of your receiver (e.g.
   `https://your-app.com/webhooks/smartcar`).
3. Choose the signals to monitor (e.g. battery state of charge, odometer,
   location) and the change conditions.
4. Save. Smartcar immediately sends a one-time **`VERIFY`** event to your
   Callback URI.

### The VERIFY Handshake (Activation)

Your endpoint **must** answer the `VERIFY` event within **15 seconds** or the
webhook stays inactive:

- Read `data.challenge` from the request body.
- Compute `HMAC-SHA256(challenge)` keyed with your Application Management Token,
  hex-encoded (use `smartcar.hashChallenge` / `smartcar.hash_challenge`).
- Respond `200 OK`, `Content-Type: application/json`, body
  `{"challenge": "<hex>"}`.

If activation fails, you can re-trigger verification any time from the Dashboard.
See [verification.md](verification.md) for code.

## Subscribe Vehicles

A webhook only delivers `VEHICLE_STATE` / `VEHICLE_ERROR` events for vehicles
that are subscribed to it. Subscribe a vehicle via the API:

```
POST https://api.smartcar.com/v2.0/vehicles/{vehicleId}/webhooks/{webhookId}
Authorization: Bearer <vehicle access token>
```

Unsubscribe with the corresponding `DELETE`. See
[Subscribing vehicles](https://smartcar.com/docs/integrations/webhooks/subscribing-vehicles).

## Test Mode vs Live Mode

Smartcar distinguishes **test** and **live** modes; each event carries its mode
in `meta.mode` (`"TEST"` / `"LIVE"`) and `data.vehicle.mode`. Use test-mode
vehicles and simulated data while developing, then switch to live vehicles in
production. The `SC-Signature` verification and VERIFY handshake are identical in
both modes.

## Local Development

Expose your local server with the Hookdeck CLI (no account required — it creates
a guest account and a public tunnel with a request inspector):

```bash
npx hookdeck-cli listen 3000 smartcar --path /webhooks/smartcar
```

Use the printed HTTPS URL as your Callback URI in the Dashboard while testing.
