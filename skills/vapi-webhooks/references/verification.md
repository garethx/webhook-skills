# Vapi Webhook Verification

## There Is No Single "Vapi Signature"

Most providers sign every payload with one fixed HMAC and header. **Vapi does
not.** Authentication on the Server URL is **opt-in and per-endpoint**: until you
attach a credential, the endpoint has **no authentication at all**. When you do
attach one, you pick which of four mechanisms it uses. So "how do I verify a Vapi
webhook?" has four answers depending on the credential you configured.

The four credential types (created in the dashboard as **Custom Credentials**,
referenced by `credentialId` on the `server` object):

1. **Bearer Token** — a literal shared secret in `Authorization: Bearer <token>`.
2. **Legacy `X-Vapi-Secret`** — the same shared secret, in `X-Vapi-Secret`.
3. **OAuth 2.0 (client credentials)** — Vapi presents a token it fetched from you.
4. **HMAC** — a signature you configure (algorithm, header, payload format).

Vapi provides **no official server-side SDK helper** for verifying any of these,
and there is **no documented source-IP allowlist**. Verification is manual.

> A `verifyVapiSignature(...)` middleware name appears in one CLI tutorial
> snippet with no implementation and no matching SDK export. **It is a
> placeholder in example code, not a real function** — do not import or call it.

## Recommended: The Shared Secret (Bearer / X-Vapi-Secret)

This is the simplest, most common, and only **fully specified** path — one exact
header, one exact comparison. It is a **literal string compare**; nothing is
hashed. Read the token from whichever header your credential is configured to
send, then compare against your stored secret with a **timing-safe** comparison.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch — guard first
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Bearer Token sends `Authorization: Bearer <token>`; the legacy credential
// (and the old server.secret field) sends the raw token in `X-Vapi-Secret`.
function extractToken(headers) {
  const auth = headers['authorization'];
  if (auth) return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  return headers['x-vapi-secret'];
}

function verifyVapiSecret(headers, expected) {
  const token = extractToken(headers);
  if (!token || !expected) return false;
  return safeEqual(token, expected);
}
```

### Python

```python
import hmac

def verify_vapi_secret(headers, expected: str | None) -> bool:
    auth = headers.get("authorization")
    if auth:
        token = auth[7:] if auth.startswith("Bearer ") else auth
    else:
        token = headers.get("x-vapi-secret")
    if not token or not expected:
        return False
    return hmac.compare_digest(token, expected)
```

On a mismatch return `401`. On success, process the message and return `200`
(with the required JSON body for the four request/response types).

## Option: OAuth 2.0 (client credentials)

With an OAuth 2.0 credential, Vapi calls **your** token endpoint with a client
ID/secret, expects back:

```json
{ "access_token": "…", "token_type": "Bearer", "expires_in": 3600 }
```

and then sends that `access_token` as `Authorization: Bearer <token>` on webhook
deliveries, refreshing automatically when it expires. To verify, validate the
presented bearer token the way you validate any access token you issued (e.g.
introspect it or check your signing) — it is *your* token, not a Vapi signature.

## Option: HMAC (fully configurable — no fixed construction)

If you choose an HMAC credential, **you** configure, in the dashboard:

- the **secret key**,
- the **algorithm** (e.g. SHA-256, SHA-1 — your choice),
- the **signature header name** (Vapi's docs show `x-signature` only as an
  *example*, not a default),
- an **optional timestamp header** for replay protection, and
- the **payload format** used for signing.

Because **Vapi publishes no fixed header name, algorithm, or signed-string
construction**, this skill will not assert one — doing so would be fabrication.
Verify against **the exact choices you made** when creating the credential. The
shape is the usual HMAC comparison:

```javascript
const crypto = require('crypto');

// Fill in YOUR configured values: algorithm, header name, and payload format.
function verifyConfiguredHmac(rawBody, headers, { secret, algorithm, headerName, encoding = 'hex' }) {
  const provided = headers[headerName.toLowerCase()];
  if (!provided || !secret) return false;
  // Payload format is whatever you selected (commonly the raw request body;
  // if you enabled a timestamp header, sign exactly what you configured).
  const expected = crypto.createHmac(algorithm, secret).update(rawBody).digest(encoding);
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

If you enabled the timestamp header, also reject stale timestamps (e.g. older
than a few minutes) to blunt replay attacks. **Confirm the header name,
algorithm, and payload format in your dashboard credential** — they are not
knowable from the docs.

## Common Gotchas

- **No auth unless you add it.** A fresh Server URL is unauthenticated. Attach a
  credential before going to production.
- **Pick your header by credential type.** Bearer/OAuth → `Authorization`; the
  legacy/`server.secret` path → `X-Vapi-Secret`. The example handler checks both.
- **The shared secret is a literal compare, not a hash.** Don't HMAC it.
- **Don't invent an HMAC scheme.** There is no documented default header,
  algorithm, or signed-string — read them off your own credential.
- **Use a timing-safe comparison** (`crypto.timingSafeEqual` /
  `hmac.compare_digest`) and guard length mismatch, which throws in Node.
- **Event type is `message.type`**, nested — not a top-level field, and not the
  `type` shown in an informal CLI tutorial.
- **Respond in time.** `assistant-request` has a hard ~7.5s timeout, and the four
  request/response types need a JSON body — a bare `200` breaks the call.

## Debugging Verification Failures

- **`401` on every request:** confirm `VAPI_WEBHOOK_SECRET` matches the token
  your credential sends (watch trailing whitespace), and that you read the right
  header for your credential type.
- **Nothing arrives:** a more specific Server URL (Tool > Assistant > Phone
  Number > Org) is overriding the one you're watching, or the credential/URL
  isn't attached at the level you expect.
- **Calls fail on inbound / tool use:** you're returning a bare `200` for a
  request/response type — return the required JSON body (and beat the ~7.5s
  `assistant-request` timeout).

## Full Documentation

- [Server Authentication](https://docs.vapi.ai/server-url/server-authentication)
- [Server URL](https://docs.vapi.ai/server-url)
- [Server Events](https://docs.vapi.ai/server-url/events)
