# Fireflies Signature Verification

## How It Works

Fireflies signs every webhook request using HMAC-SHA256. The signature is sent
in the `x-hub-signature` header as a **bare hex-encoded digest** — there is no
`sha256=` prefix (unlike GitHub or Facebook).

```
x-hub-signature: <hex-encoded-signature>
```

The signature is computed as:

```
HMAC-SHA256(raw_request_body, webhook_secret) → hex encoded
```

Compare the computed digest against the header value directly, using a
timing-safe comparison.

> **No official SDK:** Fireflies does not publish a webhook SDK for Node.js or
> Python, so verification is implemented manually in every framework. The core
> is a standard HMAC-SHA256 hex digest, which the language standard libraries
> provide (`crypto` in Node, `hmac`/`hashlib` in Python).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyFirefliesWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  // Compute expected signature over the raw body (hex, no prefix)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guard against length/format mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// Usage in Express (raw body required)
app.post('/webhooks/fireflies',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-hub-signature'];

    if (!verifyFirefliesWebhook(req.body, signature, process.env.FIREFLIES_WEBHOOK_SECRET)) {
      return res.status(401).send('Invalid signature');
    }

    // Process webhook...
  }
);
```

### Python

```python
import hmac
import hashlib

def verify_fireflies_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False

    # Compute expected signature over the raw body (hex, no prefix)
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature_header, expected_signature)
```

## Common Gotchas

### 1. No `sha256=` Prefix

Fireflies sends the digest as a bare hex string. Do **not** strip a `sha256=`
prefix (there isn't one) and do not expect one — compare the whole header value.

```javascript
// WRONG - there is no prefix to strip; this mangles the signature
const signature = signatureHeader.replace('sha256=', '');

// CORRECT - use the header value as-is
crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), Buffer.from(expected, 'hex'));
```

### 2. Raw Body Requirement

The signature is computed over the raw request body bytes. Parsing JSON first and
re-serializing will change the bytes and break verification.

**Express:**

```javascript
// WRONG - body is already parsed and re-serialized
app.use(express.json());
app.post('/webhooks/fireflies', (req, res) => {
  verifyFirefliesWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT - use the raw body
app.post('/webhooks/fireflies',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyFirefliesWebhook(req.body, ...); // Works!
  }
);
```

In Next.js App Router, read `await request.text()` and verify that string. In
FastAPI, use `await request.body()` to get the raw bytes.

### 3. Hex Encoding, Not Base64

Fireflies' signature is hex-encoded. Make sure your digest output matches:

```javascript
// WRONG - base64 encoding
.digest('base64')

// CORRECT - hex encoding
.digest('hex')
```

### 4. Timing-Safe Comparison

Always compare with a timing-safe function to avoid leaking information via
response timing:

```javascript
// WRONG - vulnerable to timing attacks
if (computedSignature === receivedSignature) { ... }

// CORRECT - timing-safe
crypto.timingSafeEqual(
  Buffer.from(receivedSignature, 'hex'),
  Buffer.from(computedSignature, 'hex')
);
```

`timingSafeEqual` throws when the two buffers differ in length (e.g. a malformed
or non-hex header). Wrap it in `try/catch` and return `false` on error.

### 5. Header Name Casing

HTTP headers are case-insensitive, and most frameworks lowercase them. Read
`x-hub-signature` in lowercase (`req.headers['x-hub-signature']`,
`request.headers.get('x-hub-signature')`, `request.headers.get("x-hub-signature")`).

## Debugging Verification Failures

### Check the Raw Body

```javascript
app.post('/webhooks/fireflies', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('Signature header:', req.headers['x-hub-signature']);
});
```

### Compare Signatures

```javascript
const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
console.log('Computed:', computed);
console.log('Received:', signature);
```

### Check Your Secret

Make sure the secret matches exactly what you configured in Fireflies Developer
Settings. Watch out for:

- Leading/trailing whitespace
- Copy-paste errors
- A secret shorter than 16 or longer than 32 characters (Fireflies requires 16–32)
- Using the API key instead of the webhook signing secret

## Full Documentation

For complete verification details, see [Fireflies Webhooks — Authentication](https://docs.fireflies.ai/graphql-api/webhooks#webhook-authentication).
