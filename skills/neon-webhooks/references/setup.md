# Setting Up Neon Auth Webhooks

## Prerequisites

- A Neon project with **Neon Auth** enabled
- Access to the Neon API (an API key) or the Neon Console
- A publicly reachable **HTTPS** endpoint (HTTPS is required)

## There Is No Signing Secret

Neon Auth uses **asymmetric** signing (Ed25519 / detached JWS). Instead of copying a
shared secret, your endpoint fetches Neon's **public keys** from the JWKS endpoint and
verifies each request against them:

```
${NEON_AUTH_URL}/.well-known/jwks.json
```

Set `NEON_AUTH_URL` to your project's Neon Auth domain. Nothing sensitive is stored on
your side — you only need the public JWKS URL.

## Register Your Endpoint

Neon Auth webhooks are configured **per project and per branch** via the Neon API (or the
Neon Console). Use the **Get / Update Neon Auth webhook config** endpoints to:

1. Set your webhook **URL** (must be HTTPS).
2. Enable the **events** you want to receive (see below).

Because config is scoped to a branch, you can point a development branch at a tunnel (see
Local Testing) and production at your deployed endpoint.

## Recommended Events

Start with the events your integration needs:

- `user.created` — sync new users to your database / CRM (non-blocking)
- `phone_number.verified` — react to phone verification (non-blocking)
- `user.before_create` — validate or reject signups (**blocking** — respond fast)
- `send.otp` / `send.magic_link` — only if you deliver OTP / magic links yourself (**blocking**)

## Blocking Events Need Fast Responses

`send.otp`, `send.magic_link`, and `user.before_create` **pause the authentication flow**
until your endpoint returns `2xx`. Do the minimum synchronously and offload heavy work to
a queue so you don't stall or time out the user's login.

## Local Testing

Use the Hookdeck CLI to receive live webhooks on your machine — no account required:

```bash
npx hookdeck-cli listen 3000 neon --path /webhooks/neon
```

Point a **development branch's** webhook URL at the tunnel URL the CLI prints, then trigger
an auth event (sign up a test user) to see deliveries.

## Retries

Neon retries a failed delivery up to **3 times**; the attempt number is in the
`X-Neon-Delivery-Attempt` header. Because a delivery can arrive more than once, make your
handler **idempotent** using the `X-Neon-Event-Id` header.
