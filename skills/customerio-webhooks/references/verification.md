# Customer.io Signature Verification

## How It Works

Customer.io signs each Reporting Webhook with an HMAC-SHA256 signature you can recompute from
the raw request body and two request headers:

| Header | Meaning |
|--------|---------|
| `X-CIO-Signature` | HMAC-SHA256 signature, **hex** encoded |
| `X-CIO-Timestamp` | Unix timestamp (seconds) of when Customer.io sent the request |

**Signed string:** `v0:<X-CIO-Timestamp>:<raw body>`

- The version prefix is **always `v0`**.
- Parts are joined with colons (`:`).
- `<raw body>` is the **exact, unmodified** request body bytes.

**Algorithm:** HMAC-SHA256, keyed with your **webhook signing key** (from the Reporting
Webhooks integration page). **Digest encoding:** lowercase **hex**. Compare with a constant-time
(timing-safe) comparison against `X-CIO-Signature`.

> This is **not** the Standard Webhooks spec. There are no `webhook-id`, `webhook-timestamp`, or
> `webhook-signature` headers, and the scheme differs from Slack-style `v0=` signatures — here
> `v0` is part of the *signed string*, not a prefix on the header value.

## No SDK Verification

Customer.io's official libraries — `customerio-node` (Node) and `customerio` (pip) — are **API
clients** for sending data *into* Customer.io. They do **not** provide webhook signature
verification helpers. Verify manually in every language/framework.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyCustomerIoWebhook(rawBody, timestamp, signature, signingKey) {
  if (!timestamp || !signature) return false;

  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(`v0:${timestamp}:`);
  hmac.update(rawBody); // Buffer or string — the raw, unmodified body
  const expected = hmac.digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // length mismatch or non-hex signature
  }
}
```

### Python (FastAPI)

```python
import hmac
import hashlib

def verify_customerio_webhook(raw_body: bytes, timestamp: str, signature: str, signing_key: str) -> bool:
    if not timestamp or not signature:
        return False

    signed_content = b"v0:" + timestamp.encode("utf-8") + b":" + raw_body
    expected = hmac.new(
        signing_key.encode("utf-8"),
        signed_content,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

- **Use the raw body.** Compute the HMAC over the exact bytes received. If you `JSON.parse` and
  re-serialize, key ordering/whitespace changes and the signature will never match. In Express
  use `express.raw({ type: 'application/json' })`; in Next.js use `await request.text()`; in
  FastAPI use `await request.body()`.
- **Include the version and timestamp.** The signed string is `v0:<timestamp>:<body>`, not just
  the body. Missing the `v0:` prefix or the timestamp is the most common failure.
- **Hex, not base64.** `X-CIO-Signature` is a hex digest. Decode/compare as hex.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`, and guard
  against length-mismatch throws (return `false`).
- **Header casing.** HTTP headers are case-insensitive; frameworks lowercase them
  (`x-cio-signature`, `x-cio-timestamp`).
- **Right key.** Use the signing key from the **Reporting Webhooks** integration page — not an
  API key or Track/App API credential.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|-------------|
| Always invalid | Body parsed before verification (re-serialized JSON), or signed string missing `v0:`/timestamp |
| Works sometimes | Using parsed body in some paths and raw in others |
| `timingSafeEqual` throws | Signature isn't valid hex or lengths differ — wrap in try/catch and return false |
| Correct locally, fails in prod | A proxy/body parser is mutating the body before your handler |
