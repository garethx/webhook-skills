# Setting Up Praxis Webhooks

## Prerequisites

- A Praxis (Praxis Tech / Cashier) merchant account
- Your **Merchant Secret** (from your merchant configuration)
- A publicly reachable HTTPS endpoint for your webhook receiver

## Get Your Merchant Secret

The **Merchant Secret** is issued with your Praxis merchant credentials
(alongside your `merchant_id` and `application_key`). It is the shared secret used
for **all** signing:

- It is appended to the concatenated field values to produce the inbound
  `gt-authentication` signature you verify.
- It is appended to `status + timestamp` to produce the
  `external-request-signature` you send on your acknowledgement.

Store it as the `PRAXIS_MERCHANT_SECRET` environment variable. Never commit it.

If you cannot locate the Merchant Secret, ask your Praxis integration/account
manager — it is not self-serve in all merchant tiers.

## Register Your Notification URL

1. In your Praxis merchant configuration (or via your Praxis account manager),
   set the **Notification URL** to your receiver, e.g.
   `https://api.example.com/webhooks/praxis`.
2. Enable the notification types you need:
   - **Payment Notification** — transaction lifecycle (`pending`, `approved`,
     `rejected`, `error`).
   - **Subscription Notification** — recurring-billing lifecycle (carries an
     `event` field).
3. Confirm your endpoint is reachable over public HTTPS.

## What Praxis Expects Back

Your endpoint **must** reply **HTTP 200** with a JSON body containing
`"status": 0`, and **must sign** that response:

```
HTTP/1.1 200 OK
Content-Type: application/json
external-request-signature: <sha384 of status + timestamp + merchant_secret>

{ "status": 0, "timestamp": 1700000000 }
```

A non-`200` status, a missing/`non-zero` `status`, or a missing/incorrect
`external-request-signature` is treated as a failed delivery and Praxis will
retry.

## Test Mode vs Live Mode

Praxis provides separate **staging** and **production** environments, each with
its own credentials and Merchant Secret. Point your staging notification URL at a
tunnel (see below) while integrating, then switch the Merchant Secret and URL for
production.

## Local Testing

Use the Hookdeck CLI to receive live webhooks on your machine — no account
required:

```bash
npx hookdeck-cli listen 3000 praxis --path /webhooks/praxis
```

This gives you a public URL to register as your Praxis Notification URL and a web
UI to inspect and replay deliveries.
