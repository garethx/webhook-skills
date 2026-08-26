# Supabase Webhooks - FastAPI Example

Receives both Supabase webhook surfaces with the correct security model for each:

| Route | Surface | How it's authenticated |
|-------|---------|------------------------|
| `POST /webhooks/supabase` | Database Webhooks (`INSERT` / `UPDATE` / `DELETE`) | **No signature exists.** Constant-time compare of a shared secret you configure in the trigger's headers JSON |
| `POST /webhooks/supabase/auth-hook` | Auth Hooks (`send_email`, `send_sms`, `custom_access_token`, `before_user_created`, `mfa_verification_attempt`, `password_verification_attempt`) | Standard Webhooks HMAC-SHA256 via the `standardwebhooks` package |

Supabase publishes no Python SDK helper for webhook verification, so this
example uses the reference
[`standardwebhooks`](https://pypi.org/project/standardwebhooks/) library — the
same protocol implementation Supabase's own docs point to. A dependency-free
manual verifier is in
[`../../references/verification.md`](../../references/verification.md).

## Prerequisites

- Python 3.9+
- A Supabase project
- For Auth Hooks: the hook secret from **Authentication → Hooks** (starts with `v1,whsec_`)
- For Database Webhooks: a shared secret you generate yourself (`openssl rand -base64 32`)

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Fill in `.env`:
   - `SUPABASE_AUTH_HOOK_SECRET` — paste the Supabase-issued value **including** the `v1,whsec_` prefix
   - `SUPABASE_WEBHOOK_SECRET` — the secret you generated for Database Webhooks

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

The tests generate real signatures with Supabase's exact algorithm —
`base64(HMAC_SHA256(base64_decode(secret_after_v1_whsec_), "{webhook-id}.{webhook-timestamp}.{raw_body}"))` —
and include a case asserting that signing with the *undecoded* base64 string is
rejected, since that is the most common implementation bug.

## Receive real webhooks locally

`--path` **replaces** the forwarded request path rather than appending to it,
so run one tunnel per surface, each with its own source:

```bash
# Database Webhooks
npx hookdeck-cli listen 8000 supabase --path /webhooks/supabase

# Auth Hooks — a separate source, because --path replaces the request path
npx hookdeck-cli listen 8000 supabase-auth-hook --path /webhooks/supabase/auth-hook
```

Use the first printed URL as the Database Webhook URL in
**Integrations → Webhooks**, and the second as the Auth Hook URI in
**Authentication → Hooks**.

## Send a Database Webhook from Supabase

In the SQL editor, create the trigger (note the shared secret in the headers —
this is the only authentication this surface has):

```sql
create trigger "orders_webhook"
after insert or update or delete on "public"."orders"
for each row execute function "supabase_functions"."http_request"(
  'https://your-tunnel-url/webhooks/supabase',
  'POST',
  '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SHARED_SECRET"}',
  '{}',
  '1000'
);
```

Then write to the table and check delivery history:

```sql
insert into public.orders (status) values ('paid');
select * from net._http_response order by created desc limit 5;
```

## Notes

- Both routes read the body with `await request.body()`. The Auth Hook signature
  covers the **exact raw body bytes** — using a Pydantic model or
  `await request.json()` would re-serialise and break verification.
- Auth Hooks are **request/response**: the auth flow blocks on your reply and the
  JSON you return changes what Supabase does. The whole invocation has a
  **5-second budget including up to three retries** (on 429/503) at a two-second
  backoff, so keep the handler fast (`async def` + non-blocking I/O) and push
  slow work to a background task or queue.
- Database Webhooks are fire-and-forget via `pg_net` with the trigger's
  `timeout_ms`. Supabase documents **no retry policy and no delivery id**, so
  make your handler idempotent by deduping on a primary key inside `record`.
- Supabase documents **no source-IP allowlist and no `user-agent` value** for
  either surface — don't build either into your receiver.
