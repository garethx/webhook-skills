# Setting Up Tebex Webhooks

## Prerequisites

- A Tebex account with access to the **Creator Panel** for your store
- Your application's public webhook endpoint URL (HTTPS)

## Get Your Signing Secret

1. Sign in to the [Tebex Creator Panel](https://creator.tebex.io/).
2. Go to **Developers → Webhooks → Endpoints**.
3. Your **webhook secret** is displayed on this page. Copy it into your
   application's environment as `TEBEX_WEBHOOK_SECRET`.

The same secret is used to verify every event delivered to your endpoints.

## Register Your Endpoint

1. On **Developers → Webhooks → Endpoints**, add a new endpoint with your
   public URL (e.g. `https://your-app.com/webhooks/tebex`).
2. Select the event types this endpoint should receive, for example:
   - `payment.completed`
   - `payment.refunded`
   - `payment.dispute.opened`
   - `recurring-payment.renewed`
   - `recurring-payment.ended`
3. Save the endpoint.

## The Validation Handshake

When you add or edit an endpoint, Tebex immediately sends a
`validation.webhook` event to confirm the URL is reachable and under your
control. Your endpoint **must**:

1. Verify the `X-Signature` header (same as any other event).
2. Respond with HTTP **200** and a JSON body echoing the received `id`:

   ```json
   { "id": "the-id-from-the-validation-payload" }
   ```

If you don't echo the `id` back with a 200, the endpoint stays inactive and no
events are delivered.

## Source IP Allowlist

Tebex delivers webhooks only from these IPs:

- `18.209.80.3`
- `54.87.231.232`

The Tebex docs suggest responding with `404` to requests from any other source
IP as defense in depth. Signature verification remains the primary check —
treat the IP allowlist as an optional extra layer, and be aware that proxies
and tunnels can change the observed source IP.

## Delivery, Retries, and Status Codes

- Always return a **2XX** status code to acknowledge receipt.
- Any non-2XX response triggers automatic retries; repeated failures can
  deactivate the endpoint and require re-validation.
- Acknowledge quickly, then do slow work (fulfillment, emails) asynchronously.

## Test Mode vs Live Mode

Tebex processes real transactions through your live store. To exercise your
handler without real payments, use a local tunnel (see the example READMEs) and
re-trigger a `validation.webhook` by editing and saving the endpoint, or replay
a captured delivery through the [Hookdeck CLI](https://hookdeck.com/docs/cli).
