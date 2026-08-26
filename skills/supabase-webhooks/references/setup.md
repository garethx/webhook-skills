# Setting Up Supabase Webhooks

Supabase has two independent surfaces. Set up the one you need — the steps and
the secrets are different.

## Prerequisites

- A Supabase project, with owner or admin access to the Dashboard
- Your application's webhook endpoint URL (publicly reachable, HTTPS in
  production)
- For local testing, a tunnel — see [Local Development](#local-development)

---

## Part 1: Database Webhooks

### How to Create a Database Webhook in the Dashboard

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Integrations → Webhooks**.
3. Click **Enable webhooks** the first time (this installs the `pg_net`
   extension and the `supabase_functions` schema).
4. Click **Create a new hook**.
5. Give it a name, then choose:
   - **Table** — the table to watch, and its schema (commonly `public`)
   - **Events** — any of `Insert`, `Update`, `Delete`
   - **Type** — HTTP Request
   - **Method** — `POST` (or `GET`)
   - **URL** — your endpoint, e.g. `https://example.com/webhooks/supabase`
   - **HTTP Headers** — see below; this is the **only** authentication you get
   - **Timeout** — milliseconds, e.g. `1000`
6. Click **Create webhook**.

### How to Get a Signing Secret

**You do not.** Supabase Database Webhooks have **no signing secret, no HMAC and
no signature header**. The docs define no verification mechanism for this
surface. Anyone who learns your URL can post to it unless you add your own
authentication.

Generate a shared secret yourself and send it as a header:

```bash
# Generate a high-entropy secret
openssl rand -base64 32
```

Add it in the webhook's **HTTP Headers**:

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <your-generated-secret>` |

Then put the same value in your app's environment as
`SUPABASE_WEBHOOK_SECRET` and compare it in constant time on every request. Any
custom header name works (`x-webhook-secret`, `x-api-key`, …) — the examples in
this skill accept `Authorization: Bearer …` and fall back to `x-webhook-secret`.

### Creating the Same Webhook in SQL

A Database Webhook is just a Postgres trigger, so you can create it in the SQL
editor or a migration:

```sql
create trigger "orders_webhook"
after insert or update or delete on "public"."orders"
for each row execute function "supabase_functions"."http_request"(
  'https://example.com/webhooks/supabase',   -- 1. url
  'POST',                                    -- 2. method: POST or GET
  '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SHARED_SECRET"}',
                                             -- 3. headers, as a JSON string
  '{}',                                      -- 4. params, as a JSON string
  '1000'                                     -- 5. timeout in milliseconds
);
```

The five arguments are, in order: **url, method, headers JSON, params JSON,
timeout_ms**.

Because the secret is stored inside the trigger definition, treat your database
schema dump as sensitive, or read the value from
[Supabase Vault](https://supabase.com/docs/guides/database/vault) instead of
inlining it.

### Inspecting Deliveries

`pg_net` records request/response history in the `net` schema:

```sql
select * from net._http_response order by created desc limit 20;
```

There is no documented retry policy — a delivery that fails or times out is
simply lost. If you need retries, replay, and delivery visibility, put a gateway
in front of your endpoint (see the Hookdeck link at the bottom).

---

## Part 2: Auth Hooks (HTTP)

### How to Enable an Auth Hook and Get Its Secret

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Authentication → Hooks**.
3. Pick the hook you want:
   - **Before User Created** (`before_user_created`) — Free, Pro
   - **Customize Access Token (JWT) Claims** (`custom_access_token`) — Free, Pro
   - **Send SMS** (`send_sms`) — Free, Pro
   - **Send Email** (`send_email`) — Free, Pro
   - **MFA Verification Attempt** (`mfa_verification_attempt`) — Teams, Enterprise
   - **Password Verification Attempt** (`password_verification_attempt`) — Teams, Enterprise
4. Choose **HTTPS** (rather than **Postgres**) as the hook type.
5. Enter your endpoint URI, e.g.
   `https://example.com/webhooks/supabase/auth-hook`.
6. Supabase generates a **secret** and shows it. Copy it — **including the
   `v1,whsec_` prefix**:

   ```
   v1,whsec_UkxKUzBrOWt2c1hHTDF3YjNVSHhOZmw3Y0dyNXlKRHE=
   ```

7. Store it in your app as `SUPABASE_AUTH_HOOK_SECRET`.

If you choose **Postgres** instead (`pg-functions://postgres/<schema>/<fn>`), no
HTTP request leaves the instance and none of the signature handling in this skill
applies.

### Local / Self-Hosted Configuration

When running Supabase locally or self-hosted, configure the hook in
`supabase/config.toml`:

```toml
[auth.hook.send_email]
enabled = true
uri = "http://host.docker.internal:3000/webhooks/supabase/auth-hook"
secrets = "env(SEND_EMAIL_HOOK_SECRETS)"
```

Note the corresponding runtime env var is **plural** — `SEND_EMAIL_HOOK_SECRETS`,
`SEND_SMS_HOOK_SECRETS`, and so on — because multiple pipe-delimited secrets are
planned for zero-downtime rotation. This is also why `webhook-signature` is a
space-delimited list: accept the request if **any** entry matches.

### Headers Supabase Sends

| Header | Description |
|--------|-------------|
| `webhook-id` | Unique message identifier |
| `webhook-timestamp` | Integer UNIX timestamp in **seconds** |
| `webhook-signature` | Space-delimited list of `v1,<base64-hmac-sha256>` entries |

Do **not** expect a Supabase-specific header such as `x-supabase-signature` — it
does not exist.

### Responding Correctly

Auth Hooks are request/response. Your body changes auth behaviour:

- `before_user_created` — `{}` to allow, `{ "error": { "http_code": 400, "message": "…" } }` with a 4xx to reject
- `custom_access_token` — `{ "claims": { … } }`
- `send_email` / `send_sms` — `{}` after **you** have sent the message
- `mfa_verification_attempt` — `{ "decision": "continue" | "reject", "message": "…" }`
- `password_verification_attempt` — as above, plus `"should_logout_user"`

Set `Content-Type: application/json` on **every** response, errors included.
Statuses `>= 400` are treated as errors. A `429` or `503` is retried up to three
times with a two-second backoff **only if you also send a non-empty `retry-after`
header** (Supabase only checks that it is non-empty, e.g. `retry-after: true`) —
without it, a `503` is not retried. Retries happen inside a **5-second total
budget for the whole invocation**, so keep the handler fast.

```javascript
// Ask Supabase to retry (up to 3 times, 2s backoff) — retry-after is required
res
  .status(503)
  .set('retry-after', 'true')
  .json({ error: { http_code: 503, message: 'Email provider unavailable' } });
```

`204 No Content` is not supported by `custom_access_token`,
`mfa_verification_attempt` or `password_verification_attempt` — they need a body.
`400` and `403` are translated into a `500` returned to your application.

---

## Local Development

Run the Hookdeck CLI to get a public tunnel — no install and no account required:

`--path` **replaces** the incoming request path when the CLI forwards to
localhost — it does not append to it. The two surfaces have two different local
routes, so run **one tunnel per surface**, each with its own source:

```bash
# Database Webhooks (Express/Next.js on 3000; use 8000 for FastAPI)
npx hookdeck-cli listen 3000 supabase --path /webhooks/supabase

# Auth Hooks — a separate source, because --path replaces the request path
npx hookdeck-cli listen 3000 supabase-auth-hook --path /webhooks/supabase/auth-hook
```

Paste the first tunnel URL into **Integrations → Webhooks** and the second into
**Authentication → Hooks**. A single tunnel would send Auth Hook deliveries to
the Database Webhook handler, which rejects them with `401` because they carry no
`Authorization` header. The CLI's web UI lets you inspect and replay every
request, which matters especially for Database Webhooks since Supabase does not
retry them.

## Testing Your Setup

**Database Webhook** — run a write against the watched table in the SQL editor:

```sql
insert into public.orders (status) values ('paid');
update public.orders set status = 'shipped' where id = 1;
delete from public.orders where id = 1;
```

Then check `select * from net._http_response order by created desc limit 5;` and
your handler's logs.

**Auth Hook** — trigger the corresponding auth action (sign up for
`before_user_created` / `send_email`, sign in for `custom_access_token`). Auth
logs are under **Logs → Auth** in the Dashboard.

## Production Checklist

- [ ] HTTPS endpoint
- [ ] `SUPABASE_WEBHOOK_SECRET` set and compared in constant time (Database Webhooks)
- [ ] `SUPABASE_AUTH_HOOK_SECRET` set with the full `v1,whsec_` value (Auth Hooks)
- [ ] Auth Hook handler returns in well under 5 seconds
- [ ] Database Webhook handler is idempotent (dedupe on a primary key in `record`)
- [ ] No reliance on a source-IP allowlist or a `user-agent` value — Supabase documents neither
