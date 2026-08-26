# Supabase Webhooks Overview

## What Are Supabase Webhooks?

Supabase is an open-source Postgres backend platform (database, auth, storage,
edge functions). It sends outbound HTTP to your endpoint through **two distinct
surfaces**, which have different triggers, payloads, and — most importantly —
different security models:

1. **Database Webhooks** — a convenience wrapper around Postgres triggers that
   call the [`pg_net`](https://github.com/supabase/pg_net) extension
   asynchronously when a row changes.
   Docs: <https://supabase.com/docs/guides/database/webhooks>
2. **Auth Hooks (HTTP Hooks)** — Supabase Auth calls your endpoint at defined
   points in the auth lifecycle and **uses your response** to decide what
   happens next.
   Docs: <https://supabase.com/docs/guides/auth/auth-hooks>

Do not conflate them. Database Webhooks are unsigned; Auth Hooks are signed with
[Standard Webhooks](https://www.standardwebhooks.com/) HMAC-SHA256.

Also do not confuse either with **Supabase Realtime** or **Supabase Queues**,
which are websocket/in-database mechanisms rather than outbound HTTP webhooks.

## Surface 1: Database Webhooks

### Common Event Types

There are exactly three, all fired **after** the row change:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `INSERT` | A row is inserted into the watched table | Send a welcome email, index a new document, enqueue onboarding work |
| `UPDATE` | A row in the watched table is updated | Sync a changed record to a CRM, invalidate a cache, react to a status column flip |
| `DELETE` | A row is deleted from the watched table | Tombstone downstream records, revoke access, clean up object storage |

The `type` field is **UPPERCASE** and is the discriminator.

### Event Payload Structure

Verbatim from the docs' TypeScript types — these are the exact top-level field
names, and there are no others:

```typescript
type InsertPayload = {
  type: 'INSERT'
  table: string
  schema: string
  record: TableRecord<T>
  old_record: null
}
type UpdatePayload = {
  type: 'UPDATE'
  table: string
  schema: string
  record: TableRecord<T>
  old_record: TableRecord<T>
}
type DeletePayload = {
  type: 'DELETE'
  table: string
  schema: string
  record: null
  old_record: TableRecord<T>
}
```

- `table` — the Postgres table name the trigger is attached to
- `schema` — the Postgres schema name (commonly `public`)
- `record` / `old_record` — mirror the row's own columns, so their **inner shape
  is defined by your table**, not by Supabase. Treat any field inside them as
  yours, not as a documented API surface.

Example for a hypothetical `public.orders` table:

```json
{
  "type": "UPDATE",
  "table": "orders",
  "schema": "public",
  "record": { "id": 42, "status": "shipped" },
  "old_record": { "id": 42, "status": "paid" }
}
```

### Delivery Semantics

- **Fire-and-forget.** `pg_net` dispatches the request asynchronously with the
  per-trigger `timeout_ms` you set when creating the trigger.
- **No documented retry policy.** Do not assume Supabase will retry a failed
  delivery.
- **No delivery id header and no idempotency header.** Deduplicate on a primary
  key inside `record` / `old_record` yourself.
- Delivery history is queryable in the database's `net` schema.

## Surface 2: Auth Hooks

Auth Hooks are **request/response**, not fire-and-forget. The auth flow blocks on
your reply and your JSON body changes what Supabase Auth does next. This is the
single biggest behavioural difference from an ordinary webhook.

| Hook (config key) | Plans | Fires when |
|-------------------|-------|------------|
| `before_user_created` | Free, Pro | Immediately before a new user row is created (signup) |
| `custom_access_token` | Free, Pro | An access token (JWT) is about to be issued |
| `send_sms` | Free, Pro | An SMS message needs to be delivered to the user |
| `send_email` | Free, Pro | An email needs to be delivered to the user |
| `mfa_verification_attempt` | Teams, Enterprise | A user attempts to verify an MFA factor |
| `password_verification_attempt` | Teams, Enterprise | A user attempts to sign in with a password |

> The "list of available Hooks" table further down the auth-hooks docs page omits
> `before_user_created`, but the plan-availability table at the top of the same
> page includes it and it has its own docs page. Six is correct.

### Payloads and Expected Responses

**`before_user_created`**

```json
{
  "metadata": { "uuid": "…", "time": "…", "name": "before-user-created", "ip_address": "…" },
  "user": { "id": "…", "email": "…", "app_metadata": {}, "user_metadata": {}, "…": "auth.users row" }
}
```

Respond `{}` to allow the signup. To reject it, respond with a 4xx and:

```json
{ "error": { "http_code": 400, "message": "Signups from this domain are not allowed" } }
```

**`custom_access_token`**

```json
{
  "user_id": "8ccaa7af-909f-44e7-84cb-67cdccb56be6",
  "claims": { "aud": "authenticated", "sub": "…", "role": "authenticated", "app_metadata": {}, "user_metadata": {} },
  "authentication_method": "password"
}
```

Respond with the claims you want in the issued JWT:

```json
{ "claims": { "…": "…", "plan": "pro" } }
```

**`send_sms`**

```json
{ "user": { "id": "…", "phone": "+15551234567" }, "sms": { "otp": "561166" } }
```

**You** are responsible for actually sending the SMS. Respond `{}` with a 2xx.

**`send_email`**

```json
{
  "user": { "id": "…", "email": "…" },
  "email_data": {
    "token": "123456",
    "token_hash": "…",
    "redirect_to": "http://localhost:3000/",
    "email_action_type": "signup",
    "site_url": "http://localhost:3000",
    "token_new": "",
    "token_hash_new": "",
    "old_email": "",
    "old_phone": "",
    "provider": "",
    "factor_type": ""
  }
}
```

**You** are responsible for actually sending the email. Respond `{}` with a 2xx.

**`mfa_verification_attempt`**

```json
{ "factor_id": "6eab6a69-7766-48bf-95d8-bd8f606894db", "user_id": "3919cb6e-…", "valid": true }
```

Respond:

```json
{ "decision": "reject", "message": "You have exceeded maximum number of MFA attempts." }
```

`decision` is `"reject"` (deny the attempt and log the user out of active
sessions) or `"continue"` (use default Supabase Auth behaviour).

**`password_verification_attempt`**

```json
{ "user_id": "3919cb6e-4215-4478-a960-6d3454326cec", "valid": true }
```

Respond:

```json
{
  "decision": "reject",
  "message": "You have exceeded maximum number of password sign-in attempts.",
  "should_logout_user": false
}
```

### Delivery Semantics

- Errors are responses with status `>= 400`.
- Retry-able errors (e.g. `429`, `503`) get up to **three retries with a
  two-second backoff** — but **only if you also send a non-empty `retry-after`
  header**. Supabase only checks that the header is non-empty, so
  `retry-after: true` is enough. A `503` without `retry-after` is **not**
  retried.
- All responses, including errors, must have `Content-Type: application/json`.
- `200` / `202` / `204` proceed, but `204 No Content` is **not** supported by
  `custom_access_token`, `mfa_verification_attempt` or
  `password_verification_attempt` — those require a response body.
- `400` and `403` responses are translated into a `500` returned to your
  application.
- The whole invocation, retries included, has a **5-second total time budget**.
  Do slow work out of band.
- Errors returned from a **Postgres** Hook are not retry-able.

## Security Model at a Glance

| | Database Webhooks | Auth Hooks (HTTP) |
|---|---|---|
| Signature | **None documented** | Standard Webhooks HMAC-SHA256 |
| Headers | Only what you configure | `webhook-id`, `webhook-timestamp`, `webhook-signature` |
| Secret | Yours to invent | Issued by Supabase as `v1,whsec_<base64>` |
| Source IP allowlist | Not documented | Not documented |
| `user-agent` value | Not documented | Not documented |

See [verification.md](verification.md) for implementation detail.

## Full Event Reference

- [Database Webhooks](https://supabase.com/docs/guides/database/webhooks)
- [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- [Standard Webhooks specification](https://www.standardwebhooks.com/)
