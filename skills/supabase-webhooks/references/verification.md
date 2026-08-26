# How to Verify Supabase Webhooks

## Why This Page Has Two Halves

Supabase's two webhook surfaces have **different security models**. Applying the
wrong one is the most common mistake with this provider:

- **Database Webhooks** — no signature exists. Authenticate with a header you
  configure yourself.
- **Auth Hooks (HTTP)** — signed with Standard Webhooks HMAC-SHA256.

---

# Part 1: Database Webhooks — No Signature

## How It Works

A Database Webhook is a Postgres trigger calling `pg_net`. The
[docs](https://supabase.com/docs/guides/database/webhooks) define **no
verification mechanism whatsoever**:

- No HMAC, no signing secret
- No `x-supabase-signature` or any Supabase-specific verification header
- No delivery id, no idempotency key
- No documented source-IP allowlist and no documented `user-agent` value

If you have seen a code sample that computes an HMAC over a Database Webhook
payload, it is fabricated. There is nothing to compute it with.

Authentication is entirely whatever you put in the **headers JSON** when creating
the webhook. The normal pattern is a static bearer token or shared-secret header,
compared in constant time on the receiver.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

/** Constant-time string compare that tolerates length mismatch. */
function timingSafeEqualStr(a, b) {
  const x = Buffer.from(a || '', 'utf8');
  const y = Buffer.from(b || '', 'utf8');
  if (x.length !== y.length) return false; // length isn't the secret here
  return crypto.timingSafeEqual(x, y);
}

/**
 * Authenticate a Supabase Database Webhook.
 * NOTE: this is a DEVELOPER-CONFIGURED shared secret, not a Supabase signature.
 * It only works because you put the same value in the trigger's headers JSON.
 */
function authenticateDatabaseWebhook(headers, secret) {
  if (!secret) return false;
  const authorization = headers['authorization'] || '';
  const presented = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : headers['x-webhook-secret'] || '';
  return timingSafeEqualStr(presented, secret);
}
```

### Python

```python
import hmac


def authenticate_database_webhook(headers, secret: str) -> bool:
    """Constant-time check of a DEVELOPER-CONFIGURED shared secret.

    Supabase Database Webhooks are unsigned; this only works because the same
    value is set in the trigger's headers JSON.
    """
    if not secret:
        return False
    authorization = headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        presented = authorization[7:].strip()
    else:
        presented = headers.get("x-webhook-secret", "")
    # Encode first: compare_digest raises TypeError on non-ASCII str input
    return hmac.compare_digest(presented.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas (Database Webhooks)

- **Do not look for a signature.** There isn't one. Reaching for
  `req.headers['x-supabase-signature']` will always be `undefined`.
- **Header names are case-insensitive** in HTTP but arrive lowercased in Express,
  Next.js (`request.headers.get()` is case-insensitive) and Starlette.
- **The secret lives in the trigger definition**, so it leaks into schema dumps.
  Rotate it by updating the trigger, or read it from Supabase Vault.
- **No retries.** `pg_net` is fire-and-forget within the trigger's `timeout_ms`.
  A 500 from your handler loses the event. Check the `net` schema
  (`select * from net._http_response order by created desc;`) when debugging.
- **Idempotency is yours.** There is no delivery id and no idempotency header.
  Dedupe on a primary key inside `record` (or `old_record` for `DELETE`).
- **Rejecting is cheap for an attacker.** Since the payload is unsigned, treat
  the endpoint as public and rate-limit it.

---

# Part 2: Auth Hooks — Standard Webhooks HMAC-SHA256

## How It Works

Supabase Auth HTTP Hooks follow the
[Standard Webhooks](https://www.standardwebhooks.com/) specification exactly.

**Headers**

| Header | Meaning |
|--------|---------|
| `webhook-id` | Unique message identifier |
| `webhook-timestamp` | Integer UNIX timestamp in **seconds** |
| `webhook-signature` | **Space-delimited** list of `v1,<base64sig>` entries |

The signature header is a list so that a secret can be rotated with zero
downtime. **Accept the request if any entry matches.** `v1` means symmetric
HMAC-SHA256; skip entries with any other version prefix.

**Secret**

Issued as:

```
v1,whsec_UkxKUzBrOWt2c1hHTDF3YjNVSHhOZmw3Y0dyNXlKRHE=
```

Strip the leading `v1,whsec_`. The remainder is **standard base64** (it may
contain `+`, `/` and `=`) and **must be base64-decoded to raw bytes** to obtain
the HMAC key.

> **This is the classic bug with this provider.** Using the base64 *string*
> itself as the HMAC key will reject every real delivery while your own tests
> pass, because your test signer makes the same mistake.

**Signed content**

```
{webhook-id}.{webhook-timestamp}.{raw_body}
```

Full stops as delimiters, over the **exact raw request body bytes**.
Re-serialising parsed JSON changes whitespace and key order and breaks the
signature.

**Signature**

`base64(HMAC_SHA256(key, signed_content))` — standard base64, not base64url.

**Timestamp tolerance**

The reference libraries allow **5 minutes in either direction** — too old *and*
too far in the future. Compare digests in constant time.

## Implementation

### SDK Verification (preferred)

Reference implementations: npm
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks), PyPI
[`standardwebhooks`](https://pypi.org/project/standardwebhooks/). Supabase's own
docs example imports `standardwebhooks@1.0.0` and calls
`.replace('v1,whsec_', '')` before constructing the verifier.

**Node.js / Next.js**

```javascript
const { Webhook } = require('standardwebhooks');

// Strip "v1,whsec_" — the library base64-decodes what remains into the HMAC key
const wh = new Webhook(process.env.SUPABASE_AUTH_HOOK_SECRET.replace('v1,whsec_', ''));

try {
  // rawBody must be the exact bytes/string received, never JSON.stringify(parsed)
  const payload = wh.verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  });
  // payload is the parsed, verified JSON
} catch (err) {
  // WebhookVerificationError: missing headers, bad timestamp, or no matching signature
}
```

**Python / FastAPI**

```python
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

secret = os.environ["SUPABASE_AUTH_HOOK_SECRET"].replace("v1,whsec_", "")
wh = Webhook(secret)

try:
    payload = wh.verify(raw_body, dict(request.headers))
except WebhookVerificationError:
    ...
```

The Python library lowercases header keys itself, so passing Starlette's
`request.headers` straight through is fine.

### Manual Verification (fallback)

Use this when you cannot add the dependency. It must match the library exactly.

```python
import base64
import hashlib
import hmac
import time


def verify_auth_hook(raw_body: bytes, headers, secret: str, tolerance: int = 300) -> bool:
    webhook_id = headers.get("webhook-id")
    webhook_timestamp = headers.get("webhook-timestamp")
    webhook_signature = headers.get("webhook-signature")
    if not (webhook_id and webhook_timestamp and webhook_signature):
        return False

    # Timestamp tolerance: 5 minutes in EITHER direction
    try:
        ts = int(webhook_timestamp)
    except ValueError:
        return False
    if abs(int(time.time()) - ts) > tolerance:
        return False

    # "v1,whsec_<base64>" -> raw key bytes. base64-DECODE; do not use the string.
    key = base64.b64decode(secret.replace("v1,whsec_", "") + "==")

    signed_content = b"%s.%s.%s" % (
        webhook_id.encode(),
        webhook_timestamp.encode(),
        raw_body,
    )
    expected = base64.b64encode(
        hmac.new(key, signed_content, hashlib.sha256).digest()
    ).decode()

    # Space-delimited list of "v1,<sig>" — accept if ANY v1 entry matches
    for versioned in webhook_signature.split(" "):
        version, _, signature = versioned.partition(",")
        if version != "v1":
            continue
        if hmac.compare_digest(expected, signature):
            return True
    return False
```

```javascript
const crypto = require('crypto');

function verifyAuthHook(rawBody, headers, secret, toleranceSeconds = 300) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number.parseInt(timestamp, 10);
  if (Number.isNaN(ts)) return false;
  // 5 minutes in EITHER direction — too old AND too far in the future
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) return false;

  // Strip "v1,whsec_" then base64-DECODE to get the raw HMAC key
  const key = Buffer.from(secret.replace('v1,whsec_', ''), 'base64');
  const signedContent = Buffer.concat([
    Buffer.from(`${id}.${timestamp}.`, 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8'),
  ]);
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');

  // Space-delimited list of "v1,<sig>" — accept if ANY v1 entry matches
  return signatureHeader.split(' ').some((versioned) => {
    const comma = versioned.indexOf(',');
    if (comma === -1) return false;
    if (versioned.slice(0, comma) !== 'v1') return false;
    const candidate = versioned.slice(comma + 1);
    try {
      return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
    } catch {
      return false; // different lengths = invalid
    }
  });
}
```

## Common Gotchas (Auth Hooks)

- **Not base64-decoding the secret.** `v1,whsec_<base64>` — the base64 part is
  the *encoded* key. Decode it. This single mistake rejects 100% of real
  deliveries.
- **Forgetting to strip `v1,`.** The npm and PyPI libraries strip `whsec_` for
  you but **not** `v1,`. Supabase's own example does
  `.replace('v1,whsec_', '')`.
- **Using the parsed body.** `JSON.stringify(req.body)` is not the signed bytes.
  Use `express.raw()`, `await request.text()`, or `await request.body()`.
- **Treating `webhook-signature` as a single value.** It is a space-delimited
  list; try every `v1,` entry.
- **Only checking "too old".** Standard Webhooks rejects timestamps more than 5
  minutes in the *future* too.
- **base64url instead of base64.** The signature is standard base64.
- **Milliseconds in the timestamp.** `webhook-timestamp` is UNIX **seconds**.
- **Non-constant-time comparison.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`, guarding against the length-mismatch throw.
- **Slow handlers.** The invocation budget is 5 seconds *including* up to three
  retries at a two-second backoff. Send the email/SMS or do the lookup fast, and
  push everything else out of band.
- **Expecting a retry without `retry-after`.** A `429` / `503` is only retried if
  the response also carries a non-empty `retry-after` header (`retry-after: true`
  suffices).
- **Wrong hook's secret.** Each hook gets its own secret
  (`SEND_EMAIL_HOOK_SECRETS`, `SEND_SMS_HOOK_SECRETS`, …). If one hook verifies
  and another doesn't, check you didn't reuse the wrong value.

## How to Debug Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `No matching signature found` on every Auth Hook delivery | Secret not base64-decoded, or `v1,` not stripped |
| Works in tests, fails in production | Your test signer replicates the same secret-handling bug |
| `Missing required headers` | Reading `svix-*` or `x-supabase-*` instead of `webhook-*` |
| `Message timestamp too old` / `too new` | Server clock drift, or `webhook-timestamp` parsed as milliseconds |
| Signature fails only for some payloads | Body was parsed and re-serialised; unicode or key order changed |
| Database Webhook rejected as "invalid signature" | You applied Auth Hook verification to an unsigned surface |
| Database Webhook never arrives | `pg_net` timed out (`timeout_ms`); check `net._http_response` |
| Auth flow succeeds but your hook never ran | Hook configured as `pg-functions://…` (Postgres), so no HTTP is sent |

To confirm your key handling, sign a known payload and compare against a library:

```bash
node -e '
const {Webhook}=require("standardwebhooks");
const wh=new Webhook("whsec_dGVzdF9zZWNyZXRfa2V5");
console.log(wh.sign("msg_123", new Date(1700000000*1000), JSON.stringify({hello:"world"})));
'
```
