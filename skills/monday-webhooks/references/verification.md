# monday.com Signature Verification

monday.com secures webhooks with **two independent mechanisms**. Handle both.

## 1. The Challenge Handshake (registration)

When a webhook is created, monday.com POSTs a JSON body containing a `challenge`
token and expects the same token echoed back:

```json
// Request from monday.com
{ "challenge": "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P" }

// Your 200 response
{ "challenge": "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P" }
```

Handle this **first** in your endpoint — before any JWT check — because the challenge
request may arrive without an `Authorization` header. Detect it by the top-level
`challenge` field (real events never have one; their data is under `event`).

## 2. JWT Verification (per request)

For webhooks created by an **integration app**, monday.com signs each request with a
**JWT** placed in the `Authorization` header:

- **Header:** `Authorization` (the raw token, sometimes with a `Bearer ` prefix)
- **Algorithm:** `HS256` (HMAC-SHA256)
- **Key:** your app's **Signing Secret** (board/integration webhooks) or **Client
  Secret** (app lifecycle webhooks)
- **Claims:** `accountId`, `userId`, `aud` (your endpoint URL), `exp`, `iat`,
  `shortLivedToken` (a 5-minute API token)

> **Not Standard Webhooks.** monday.com does not use `webhook-id` /
> `webhook-timestamp` / `webhook-signature` headers.

### Important: the JWT does NOT sign the body

Unlike Stripe, GitHub, or Shopify (which HMAC the raw request body), monday.com's JWT
is a **self-contained token** — it authenticates that the request came from
monday.com but does **not** contain a hash of the body. Consequences:

- You may parse the JSON body **before** verifying the JWT — verification never reads
  the body. (The usual "verify the raw body first" rule does not apply here.)
- Because the body is not signed, the JWT alone does not prove body integrity. For
  high-assurance flows, refetch the changed item from the monday.com API using the
  `shortLivedToken` claim rather than trusting body contents blindly.

### Not every webhook sends a JWT

Webhooks created with a **personal API token** or the **no-code board integration**
may not include the `Authorization` header at all. Design your handler accordingly:

- **Integration-app webhooks:** require and verify the JWT; reject (401) if missing
  or invalid. This is what the examples demonstrate.
- **No-code / personal-token webhooks:** you cannot rely on the JWT. Add a hard-to-
  guess secret to the URL path, or front the endpoint with Hookdeck, and rely on the
  challenge handshake for registration.

## Implementation

### Node.js (jose)

monday.com has no official webhook-verification SDK, so use a standard JWT library.

```javascript
import { jwtVerify } from 'jose';

async function verifyMondayJwt(authHeader, secret) {
  if (!authHeader) throw new Error('Missing Authorization header');
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;
  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(secret),
    { algorithms: ['HS256'] } // throws on bad signature or expired token
  );
  return payload;
}
```

### Python (PyJWT)

```python
import jwt

def verify_monday_jwt(auth_header: str, secret: str) -> dict:
    if not auth_header:
        raise jwt.InvalidTokenError("Missing Authorization header")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else auth_header
    # Raises jwt.InvalidTokenError (bad signature) or ExpiredSignatureError
    return jwt.decode(token, secret, algorithms=["HS256"])
```

## Optional Hardening: verify the audience

The `aud` claim equals the endpoint URL monday.com was configured with. To reject
tokens minted for a different endpoint, pass the expected audience:

```javascript
await jwtVerify(token, key, { algorithms: ['HS256'], audience: process.env.MONDAY_WEBHOOK_URL });
```

```python
jwt.decode(token, secret, algorithms=["HS256"], audience=os.environ["MONDAY_WEBHOOK_URL"])
```

The examples leave audience checking off by default so tunnel URLs (Hookdeck, ngrok)
work out of the box; enable it in production.

## Common Gotchas

- **Echo the challenge first.** If you run JWT verification before the challenge
  check, registration fails for no-code webhooks that send no token.
- **`Authorization` header may be absent.** Personal-token / no-code webhooks don't
  send a JWT — don't assume every request has one.
- **Don't `Bearer`-assume.** monday.com often sends the raw token with no `Bearer `
  prefix. Strip the prefix only if present.
- **Wrong secret.** Board webhooks use the **Signing Secret**; app lifecycle events
  use the **Client Secret**. Mixing them up fails verification.
- **`monday-sdk-js` is not a verifier.** It's an API client for making GraphQL calls
  — it has no webhook signature helper.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Registration never completes | Endpoint not echoing `{ "challenge": … }` with 200 |
| Every request returns 401 | Wrong secret, or using Client Secret where Signing Secret is needed |
| 401 only on some webhooks | Those webhooks were created with a personal token / no-code and send no JWT |
| `invalid algorithm` | Force `algorithms: ['HS256']`; never allow `none` |
| `jwt expired` | Clock skew, or a replayed/stale request — monday retries for 30 min |
