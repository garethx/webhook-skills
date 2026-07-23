# How to Verify Commerce Layer Webhook Signatures

## How It Works

Every Commerce Layer callback is signed. Commerce Layer computes an **HMAC-SHA256** over
the **raw request body**, keyed with the webhook's **`shared_secret`**, encodes the
result as **base64**, and sends it in the `X-CommerceLayer-Signature` header.

To verify, recompute the same HMAC over the raw body you received and compare it, in a
timing-safe way, against the header value.

| Property | Value |
|----------|-------|
| Header | `X-CommerceLayer-Signature` |
| Topic header | `X-CommerceLayer-Topic` |
| Algorithm | HMAC-SHA256 |
| Encoding | base64 |
| Signed content | Raw request body (unparsed) |
| Secret | The webhook's `shared_secret` (from the create response) |

## Why Signature Verification Matters

Your `callback_url` is a public endpoint. Without verification, anyone who discovers it
could POST fake events (fake orders, fake refunds). Verifying the signature proves the
request was signed with your `shared_secret` and the body was not tampered with.

## Implementation

Commerce Layer has **no SDK verification helper** — the official docs show manual
verification with the platform crypto library. Use manual HMAC in every language/framework.

### Node.js

```javascript
const crypto = require('crypto');

function verifyCommerceLayerSignature(rawBody, signature, sharedSecret) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', sharedSecret)
    .update(rawBody) // Buffer or string — do NOT JSON.parse first
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths => invalid
  }
}
```

### Python

```python
import hmac, hashlib, base64

def verify_commercelayer_signature(raw_body: bytes, signature: str, shared_secret: str) -> bool:
    if not signature:
        return False
    expected = base64.b64encode(
        hmac.new(shared_secret.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(signature, expected)
```

The official Node example from the docs is equivalent:

```javascript
import { createHmac } from "node:crypto";

const encode = createHmac("sha256", process.env.CL_SHARED_SECRET)
  .update(req.body)      // raw body
  .digest("base64");

const ok = signature === encode; // prefer a timing-safe compare in production
```

## Common Gotchas

- **Use the raw body, not the parsed one.** This is the #1 cause of failures. Frameworks
  that auto-parse JSON (Express `express.json()`, etc.) re-serialize the body with
  different byte order/whitespace, which changes the HMAC. Read the raw bytes:
  - Express: `express.raw({ type: 'application/json' })`
  - Next.js App Router: `await request.text()`
  - FastAPI: `await request.body()`
- **`shared_secret`, not API credentials.** The signing key is the webhook's
  `shared_secret` returned when you created the webhook — not your `client_secret` or
  access token.
- **base64, not hex.** `.digest('base64')` — a hex digest will never match.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`. Wrap the
  Node comparison in `try/catch` because `timingSafeEqual` throws when buffers differ in
  length.
- **Header casing.** HTTP headers are case-insensitive; frameworks lowercase them
  (`x-commercelayer-signature`). Read them accordingly.
- **Respond within 5 seconds.** Verify first, then offload slow work to a queue so you can
  return 2xx quickly. After 30 consecutive failures the webhook's circuit breaker
  disables it until reset.

## How to Debug Verification Failures

1. **Log the raw body length and the received signature.** Confirm you're hashing the
   exact bytes received (no middleware re-serialized them).
2. **Compare your computed base64 digest to the header** in a scratch script using a
   captured raw body + the `shared_secret`.
3. **Confirm the secret.** Re-read `shared_secret` from the webhook's create response;
   creating a new webhook generates a new secret.
4. **Check encoding.** Ensure base64 (not hex) and SHA-256 (not SHA-1).
5. **Check the framework parsed the body.** If your logged body is a JS object rather than
   a Buffer/string, a JSON parser ran before verification — switch to raw-body handling.
