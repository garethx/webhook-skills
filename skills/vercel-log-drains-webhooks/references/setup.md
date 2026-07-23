# Setting Up Vercel Log Drains

## Prerequisites

- A Vercel team on a **Pro or Enterprise** plan (Log Drains are usage-billed)
- Owner/admin access to the team's settings
- Your application's HTTPS webhook endpoint URL (must be publicly reachable)

## Option A: Dashboard

1. Go to the Vercel **Dashboard** and select your team in the team switcher.
2. Open **Settings** → **Drains**.
3. Click **Create Drain** and choose the **Logs** data type.
4. Enter your endpoint URL (e.g. `https://your-app.com/webhooks/vercel-log-drains`).
5. Under **Additional configuration for logs**, choose:
   - **Sources**: `static`, `lambda`, `edge`, `build`, `external`, `firewall`.
   - **Environments**: `production` and/or `preview`.
   - **Sampling rules** (optional): per-environment percentage and path prefix.
6. Choose the **delivery format**: `JSON` (array) or `NDJSON`.
7. (Optional) Enable **gzip compression** and add **custom headers** for extra
   authentication (e.g. an `Authorization` header your endpoint also checks).
8. Save. Vercel sends an **unsigned verification probe** to your endpoint (see
   "Endpoint verification handshake" below).

## Get Your Signature Secret

Vercel auto-generates a **signature secret** for each drain. To find or rotate it:

1. In **Settings** → **Drains**, click **Edit** on your drain.
2. Copy the **signature secret** and store it as `VERCEL_LOG_DRAIN_SECRET` in
   your environment.

This secret keys the HMAC-SHA1 signature sent in the `x-vercel-signature` header.
See [verification.md](verification.md).

## Endpoint Verification Handshake

When the drain is created or tested, Vercel issues an **unsigned** request and
expects your endpoint to prove ownership by returning the verification token in
the `x-vercel-verify` **response header**.

- The verification token is shown in the dashboard when you create the drain.
- Store it as `VERCEL_VERIFY` and echo it on responses (the example handlers set
  this header on every response, which is safe).
- Because the probe carries no `x-vercel-signature`, handlers treat a request
  with no signature as the handshake: respond `200` with the verify header and
  skip log processing.

## Option B: REST API

Create a drain with the REST API `POST /v1/drains`:

```bash
curl -X POST "https://api.vercel.com/v1/drains?teamId=$VERCEL_TEAM_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-log-drain",
    "dataType": "logs",
    "url": "https://your-app.com/webhooks/vercel-log-drains",
    "sources": ["lambda", "edge", "build", "static", "external", "firewall"],
    "environments": ["production", "preview"],
    "delivery": {
      "encoding": "json",
      "secret": "your_drain_signature_secret",
      "headers": { "Authorization": "Bearer optional-custom-token" }
    }
  }'
```

- `delivery.encoding` is `json` or `ndjson`.
- `delivery.secret` is the signature secret used for `x-vercel-signature`.
- `delivery.headers` are optional custom headers added to each delivery.

> The legacy `/v1/log-drains` and `/v2/integrations/log-drains` endpoints are
> **deprecated** — use `/v1/drains` with `dataType: "logs"`.

## Testing

- Use the **Test** button on the drain in the dashboard to trigger a probe.
- Trigger real logs by deploying and making requests to your app.
- Locally, tunnel deliveries to your machine with the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 vercel-log-drains --path /webhooks/vercel-log-drains
  ```

## Reliability Notes

Vercel emails you and marks the drain **errored** if more than 80% of deliveries
fail or there are more than 50 failures in an hour. No per-batch retry schedule
is documented — make your handler idempotent using the log entry `id`.
