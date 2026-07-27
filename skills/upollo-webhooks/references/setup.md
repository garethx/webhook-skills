# Setting Up Upollo Webhooks

## Prerequisites

- An Upollo account (app.upollo.ai).
- Your application reporting user activity to Upollo (via the Upollo client/server
  SDK or API) so there is something to analyse and flag.
- A publicly reachable HTTPS endpoint to receive deliveries.

> **Operational status.** At the time of writing, `app.upollo.ai` /
> `upollo.ai` did not resolve and the npm packages `@upollo/web` /
> `@upollo/node` returned 404 (the PyPI `upollo-python` SDK is still published).
> Confirm Upollo is operational before relying on these steps, and re-verify the
> exact secret-creation flow in the live dashboard.

## Step 1: Add Your Webhook URL and Get the Secret

1. Sign in to the Upollo dashboard at **app.upollo.ai**.
2. Open the **Access & Keys** page.
3. Under **Webhooks**, add your endpoint URL (e.g.
   `https://your.app/webhooks/upollo`).
4. Upollo generates a **webhook secret** when you add the URL. Copy it.

Store the secret as `UPOLLO_WEBHOOK_SECRET`. It is the key used to verify every
delivery's `Upollo-Signature`.

```bash
UPOLLO_WEBHOOK_SECRET=your_webhook_secret_here
```

> The secret is created **for the webhook URL** — not the same as your Upollo
> API key. Verify signatures with this webhook secret, not the API key.

## Step 2: Report Activity So Upollo Can Flag Users

Webhooks only fire when Upollo flags a user, and Upollo can only flag users you
tell it about. Report activity (logins, registrations, purchases, …) using
Upollo's SDK/API. Upollo's SDKs:

| Package | Registry | Status |
|---------|----------|--------|
| `upollo-python` | PyPI | Published (gRPC analysis client) |
| `@upollo/web` | npm | **Documented but returns 404** at time of writing |
| `@upollo/node` | npm | **Documented but returns 404** at time of writing |

> These SDKs are **analysis clients** (they call Upollo to analyse users). They
> do **not** verify webhook signatures — verification is a plain HMAC-SHA512 you
> compute yourself (see [verification.md](verification.md)). That is why the
> example handlers verify manually and do not depend on an Upollo SDK.

## Step 3: Verify Deliveries

Every delivery includes an `Upollo-Signature` header of the form
`t:<unix_ts>,s0:<hmac-sha512>`. Recompute `HMAC-SHA512(secret, raw_body)` and
compare against `s0` using a constant-time comparison. See
[verification.md](verification.md).

## Step 4: Trigger a Test Flag

Report a user with a suffixed email to force a flag:

| Email suffix | Flag raised |
|--------------|-------------|
| `+account_sharing` | `ACCOUNT_SHARING` |
| `+multiple_accounts` | `MULTIPLE_ACCOUNTS` |

For example, report activity for `you+account_sharing@example.com` and Upollo
should flag the user and POST an analysis to your webhook.

## Local Testing

Use the Hookdeck CLI to forward Upollo webhooks to your local server (no account
required — it creates a guest account on first run):

```bash
npx hookdeck-cli listen 3000 upollo --path /webhooks/upollo
```

Point your Upollo webhook URL at the Hookdeck URL the CLI prints, then trigger a
test flag. Hookdeck forwards the delivery to your local handler and lets you
inspect and replay it.
