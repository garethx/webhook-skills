# Picqer Signature Verification

## How It Works

Picqer signs every webhook request with **HMAC-SHA256**, keyed on the per-hook
`secret` you set when creating the hook. The signature is the digest of the
**entire raw request body**, **base64-encoded**, and sent in the
`X-Picqer-Signature` header.

```
X-Picqer-Signature = base64( HMAC-SHA256( raw_request_body, hook_secret ) )
```

This matches Picqer's PHP documentation example:

```php
base64_encode(hash_hmac('sha256', $webhookPayloadRaw, 'your-provided-secret', true));
```

Picqer does **not** follow the [Standard Webhooks](https://www.standardwebhooks.com/)
spec — there is no `webhook-id` / `webhook-timestamp` / `webhook-signature`
header and no timestamp is included in the signed content. Only the raw body is
signed.

> **The secret is optional.** If you create a hook without a `secret`, Picqer
> sends no `X-Picqer-Signature` header and verification is impossible. Always
> set a secret. See [setup.md](setup.md).

## Implementation

There is no official Node or Python SDK (the official SDK is PHP-only), so
verify the signature manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyPicqerWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)          // rawBody is a Buffer/string, NOT parsed JSON
    .digest('base64');

  // Timing-safe comparison; returns false on length mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib, base64

def verify_picqer_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(signature_header, expected)
```

## Common Gotchas

### 1. Use the raw body, not parsed JSON

The signature is computed over the exact bytes Picqer sent. If you parse the
JSON and re-serialize it, key ordering and whitespace change and the signature
will not match.

**Express** — mount `express.raw()` on the webhook route so `req.body` is a
`Buffer`:

```javascript
// CORRECT
app.post('/webhooks/picqer',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyPicqerWebhook(req.body, req.headers['x-picqer-signature'], secret);
  }
);

// WRONG — express.json() already parsed the body
app.use(express.json());
```

**Next.js** — read `await request.text()` and pass that string to the verifier.

**FastAPI** — read `await request.body()` (bytes) before doing anything else.

### 2. Base64, not hex

Picqer base64-encodes the digest. `digest('hex')` (Node) or `.hexdigest()`
(Python) will never match.

```javascript
.digest('base64')   // CORRECT
.digest('hex')      // WRONG
```

### 3. The event type is in the body, not a header

There is no event/topic header. After verifying, parse the body and dispatch on
`payload.event`.

### 4. Timing-safe comparison

Always compare with `crypto.timingSafeEqual` (Node) or `hmac.compare_digest`
(Python), and guard against length mismatches (they throw in Node).

### 5. No signature header means no secret

If `X-Picqer-Signature` is absent, the hook was created without a secret.
Recreate the hook with a `secret` — do not silently accept unsigned requests.

## Debugging Verification Failures

```javascript
const expected = crypto
  .createHmac('sha256', secret)
  .update(rawBody)
  .digest('base64');

console.log('Body is Buffer:', Buffer.isBuffer(rawBody)); // should be true in Express
console.log('Received:', req.headers['x-picqer-signature']);
console.log('Expected:', expected);
```

If they differ, check in order: (1) is `rawBody` the untouched raw body?
(2) is `secret` exactly the value you passed as the hook's `secret`?
(3) are you base64-encoding (not hex)?

## Full Documentation

See [Picqer — Validating webhooks](https://picqer.com/en/api/webhooks#validating-webhooks).
