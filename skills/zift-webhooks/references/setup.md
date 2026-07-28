# Setting Up Zift Webhooks

## Prerequisites

- A Zift integrator/reseller account (webhooks are configured at the
  **integrator/reseller level**, not per-merchant)
- A publicly reachable **HTTPS** endpoint URL for your receiver
- The list of events you want to receive

## Configuration Is Out-of-Band

Unlike dashboard-driven providers, Zift webhooks are **set up by Zift support**.
There is no self-service signing-secret screen because there is no signing
secret — see [verification.md](verification.md).

To register your endpoint:

1. **Email Zift support** with:
   - Your **HTTPS endpoint URL** (e.g. `https://api.example.com/webhooks/zift`).
     Use a long, unguessable path — the URL secrecy is part of your security
     posture.
   - The **events** you want to receive, by trigger name (see below).
   - Optionally, request Zift's **egress IP ranges** so you can allowlist them
     at your firewall / load balancer.
2. Zift enables the notifications for your integrator/reseller account.
3. Test in your staging environment and confirm you return the acknowledgement
   (see "Acknowledgement" below).

## Event Trigger Names

Ask Zift to enable the events you need, using their trigger names:

**Billing**

- `subscription~create`
- `payment-option~create`
- `allocation~create`
- `payment~process`

**Processing**

- `chargeback`
- `return`
- `reversal`
- `NOC`

The trigger names use `~` (e.g. `subscription~create`); the delivered payload's
`eventCode` uses the dotted `category.entity-action` form (e.g.
`billing.subscription-created`). Confirm the exact delivered `eventCode`
literals with Zift support — see [overview.md](overview.md).

## Acknowledgement (Required)

Your endpoint MUST acknowledge each delivery by returning a JSON body echoing the
received `notificationId`:

```json
{ "notificationId": 272638 }
```

Zift accepts the id as an int (`272638`) or string (`"272638"`) — echo it back
in whichever form you received it. **Returning `200 OK` with any other body (or
an empty body) is not an acknowledgement** and causes Zift to retry at +5 min,
+15 min, +60 min, +24 h, then mark the notification `Failed`.

## Test Mode vs Live Mode

Zift does not expose a dashboard "send test event" button for webhooks. To test
locally, use the Hookdeck CLI tunnel (see the example READMEs):

```bash
npx hookdeck-cli listen 3000 zift --path /webhooks/zift
```

Then confirm your handler returns `{ "notificationId": ... }` for a sample
payload. Validate the full path (including IP allowlisting, if used) in a
staging environment before going live.

## No Signing Secret

There is intentionally no secret to copy into your `.env`. The only optional
configuration is an IP allowlist (`ZIFT_ALLOWED_IPS`), enforced by your infra.
See [verification.md](verification.md) for how to secure an endpoint that has no
signature.
