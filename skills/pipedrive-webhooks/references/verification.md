# How to Verify Pipedrive Webhooks

## Why There Is No Signature to Verify

Unlike Stripe, GitHub, or Shopify, **Pipedrive does not sign webhook payloads**.
There is:

- **No HMAC** and no cryptographic signature.
- **No signature header** (`X-Pipedrive-Signature` does not exist).
- **No Standard Webhooks** support (`webhook-id` / `webhook-timestamp` /
  `webhook-signature` headers are not sent).

Because there is nothing to hash, the `pipedrive` SDK is an **API client only** —
it has no `verifyWebhook`/`constructEvent` helper. Verification is done manually
in every framework.

## How Authentication Works: HTTP Basic Auth

When you create a webhook you can set `http_auth_user` and `http_auth_password`.
Pipedrive then includes them on **every delivery** as a standard HTTP Basic Auth
header:

```
Authorization: Basic base64(http_auth_user + ":" + http_auth_password)
```

Your endpoint must:

1. Be served over **HTTPS** (self-signed certificates are not supported).
2. Decode the `Authorization` header and compare the credentials to the values
   you configured, using a **timing-safe** comparison.

> Always set `http_auth_user` and `http_auth_password`. Without them the endpoint
> is unauthenticated and anyone who learns the URL can POST fake events.

## Implementation

There is no SDK verification path, so all frameworks use the same manual check.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on unequal lengths — length-check first
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function verifyBasicAuth(authHeader, user, pass) {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // password may contain ':'
  if (sep === -1) return false;
  return safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), pass);
}
```

### Python (FastAPI)

```python
import base64, binascii, hmac

def verify_basic_auth(auth_header, user, password):
    if not auth_header or not auth_header.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(auth_header[6:], validate=True).decode("utf-8")
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return False
    got_user, sep, got_pass = decoded.partition(":")  # password may contain ':'
    if not sep:
        return False
    return hmac.compare_digest(got_user, user) and hmac.compare_digest(got_pass, password)
```

## Building the Event Type

The payload has no combined event string. Compose it from the `meta` block:

```javascript
const event = `${body.meta.action}.${body.meta.entity}`; // e.g. "change.person"
```

## Common Gotchas

- **No signature exists** — do not look for `X-Pipedrive-Signature` or try to
  HMAC the body. Authentication is Basic Auth only.
- **Use a timing-safe comparison** (`crypto.timingSafeEqual` /
  `hmac.compare_digest`), not `===`/`==`, to avoid leaking the credentials.
- **Passwords may contain `:`** — split on the *first* colon only (use
  `indexOf`/`partition`), never `split(':')`.
- **HTTPS is required**; self-signed certificates are rejected. Use a tunnel for
  local testing.
- **The event string is derived**, not delivered — build it from `meta.action` +
  `meta.entity`.
- **Raw body is not needed** for authentication (there's no signature over it),
  so normal JSON parsing is fine — but still validate that `meta.action` and
  `meta.entity` are present before dispatching.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Every delivery is 401 | `PIPEDRIVE_WEBHOOK_USER` / `PIPEDRIVE_WEBHOOK_PASSWORD` don't match `http_auth_user` / `http_auth_password` on the webhook |
| 401 only for some passwords | Password contains `:` and you split on all colons — split on the first only |
| Pipedrive never calls you | Endpoint is HTTP (not HTTPS) or uses a self-signed cert |
| Webhook disappeared | No successful (`2XX`) delivery for 3 consecutive days → auto-deleted |
| Deliveries pause for ~30 min | 10 first-attempt failures → temporary suspension |

## Reduce Duplicate Processing

Pipedrive retries after **3s, 30s, and 150s** (up to 4 attempts), so the same
event can arrive more than once. Deduplicate using `meta.correlation_id`. See
[webhook-handler-patterns → idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).
