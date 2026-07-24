# Enode Signature Verification

## How It Works

Enode signs every webhook delivery using **HMAC-SHA1** (not SHA-256). The signature is sent in the `x-enode-signature` header in the format:

```
x-enode-signature: sha1=<hex-encoded-signature>
```

The signature is computed as:

```
HMAC-SHA1(raw_request_body, webhook_secret) → lowercase hex
```

Key facts:

- **Algorithm:** HMAC-SHA1 (deliberately — Enode uses SHA-1, unlike GitHub/Stripe which use SHA-256).
- **Encoding:** lowercase hex, prefixed with `sha1=`.
- **Signed content:** the **raw** UTF-8 request body exactly as received, before any JSON parsing.
- **Secret:** the value **you** generated and passed as `secret` when creating the webhook (min 128 bits). Enode never returns it.
- **Not Standard Webhooks:** there is no `webhook-id` / `webhook-timestamp` / `webhook-signature` scheme and no timestamp in the signed content.
- **No official SDK:** verify manually with your language's crypto library.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyEnodeWebhook(rawBody, signatureHeader, secret) {
  // Header format: sha1=<hex>
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha1' || !sig) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; returns false on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac
import hashlib

def verify_enode_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    # Header format: sha1=<hex>
    algo, _, sig = (signature_header or "").partition("=")
    if algo != "sha1" or not sig:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(sig, expected)
```

## Common Gotchas

### 1. Use the Raw Body

The signature is computed over the raw request body. Parsing to JSON and re-serializing will change bytes (key order, whitespace) and break verification.

**Express:**
```javascript
// WRONG - body is already parsed and re-stringified
app.use(express.json());
app.post('/webhooks/enode', (req, res) => {
  verifyEnodeWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT - capture the raw body
app.post('/webhooks/enode',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyEnodeWebhook(req.body, ...); // Works!
  }
);
```

### 2. It's SHA-1, Not SHA-256

Enode uses HMAC-**SHA1**. Copying a Stripe/GitHub handler that uses `sha256` will always fail:

```javascript
// WRONG
crypto.createHmac('sha256', secret)

// CORRECT
crypto.createHmac('sha1', secret)
```

### 3. Hex Encoding (Lowercase)

The digest is lowercase hex, not base64:

```javascript
// WRONG
.digest('base64')

// CORRECT
.digest('hex')
```

### 4. Strip the `sha1=` Prefix

The header value is `sha1=<hex>`. Compare only the hex portion (or the full string against a `sha1=`-prefixed expected value — just be consistent).

### 5. Timing-Safe Comparison

Always use a constant-time compare to avoid timing attacks:

```javascript
// WRONG - vulnerable to timing attacks
if (expected === received) { ... }

// CORRECT
crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))
```

`timingSafeEqual` throws when the two buffers differ in length, so wrap it in `try/catch` and return `false`.

### 6. The Body Is an Array

After verifying, `JSON.parse(rawBody)` yields an **array** of events. Iterate it — do not assume a single object:

```javascript
const events = JSON.parse(rawBody);
for (const evt of events) {
  handle(evt.event, evt);
}
```

## Debugging Verification Failures

### Compare Signatures

```javascript
const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
console.log('Computed:', expected);
console.log('Received:', (signatureHeader || '').replace('sha1=', ''));
```

### Check the Raw Body Type

```javascript
console.log('Body is Buffer:', Buffer.isBuffer(req.body)); // must be true
console.log('Signature header:', req.headers['x-enode-signature']);
```

### Check Your Secret

Ensure the secret matches exactly what you passed as `secret` when creating the webhook. Watch for:
- Leading/trailing whitespace
- Copy-paste errors
- Using a different secret per webhook

## Full Documentation

For complete verification details, see the [Enode Webhooks Guide](https://developers.enode.com/docs/webhooks).
