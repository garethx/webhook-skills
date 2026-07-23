# Setting Up Paystack Webhooks

## Prerequisites

- A Paystack account (with dashboard access)
- Your application's public webhook endpoint URL (HTTPS)

## Get Your Secret Key

Paystack signs webhooks with your **secret key** — the same key you use for API
requests. You do **not** create a separate webhook signing secret.

1. Log in to the [Paystack Dashboard](https://dashboard.paystack.com/).
2. Go to **Settings → API Keys & Webhooks**.
3. Copy your **Secret Key** (`sk_test_…` in test mode, `sk_live_…` in live mode).
4. Store it in your app as `PAYSTACK_SECRET_KEY`.

Test mode and live mode have **different** secret keys. A webhook signature is
valid only against the key for the mode that sent the event.

## Register Your Endpoint

1. On the same **Settings → API Keys & Webhooks** page, find the **Webhook URL**
   field.
2. Enter your endpoint URL, e.g. `https://your-app.com/webhooks/paystack`.
3. Save.

Test mode and live mode are configured **separately** — set the Webhook URL in
each mode you want to receive events for. You do not select individual events;
your endpoint receives all events for that mode. Dispatch on the `event` field
in the body.

## IP Allowlisting (Optional but Recommended)

Paystack sends webhooks from a fixed set of IP addresses (the same for test and
live):

```
52.31.139.75
52.49.173.169
52.214.14.220
```

If your server or firewall restricts inbound traffic, allowlist these IPs. IP
allowlisting is a network-layer control **in addition to** signature
verification — it is not a replacement for verifying `x-paystack-signature`.

## Responding to Webhooks

- **Respond with HTTP 200 immediately.** Acknowledge receipt first, then do the
  heavy work asynchronously (queue/background job). Paystack's request timeout is
  **30 seconds**.
- **Any non-200 response triggers retries:**
  - **Live mode:** every 3 minutes for the first 4 attempts, then hourly for up
    to 72 hours.
  - **Test mode:** hourly for 10 hours.
- Retries can produce **duplicate** deliveries, so make your handler idempotent
  (dedupe on `event` + `data.id`/`data.reference`). See the
  [idempotency reference](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).

## Test Mode vs Live Mode

- **Test mode:** Use your `sk_test_…` key and Paystack's test cards/flows to
  trigger events (e.g. a test-mode transaction). The Test-mode webhook URL fires,
  signed with your test secret key.
- **Live mode:** Real transactions trigger real events against the Live-mode
  webhook URL, signed with your live secret key.

Always verify the signature in both modes — the algorithm is identical; only the
key differs.

## Verify Delivery

After configuring the Webhook URL, trigger a test event (e.g. a test-mode
transaction) and confirm your endpoint returns **HTTP 200**. For `charge.success`,
re-verify the transaction with the Verify Transaction API
(`GET /transaction/verify/:reference`) before giving value.
