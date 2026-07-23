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

> **Unconfirmed: raw bytes vs `JSON.stringify`.** The header name, the algorithm,
> the hex encoding, and the absence of a prefix are documented. The exact body
> form that goes into the HMAC is **not** stated in prose — the docs point at an
> external Replit code sample that could not be read, so "raw request body" here
> is the safest reading rather than a quoted fact. Keep raw body as your default:
> when the provider signs a re-serialized string that happens to be byte-identical
> to what it sent, raw body still verifies. But if verification fails
> consistently — right secret, right header, right encoding — try
> `JSON.stringify(JSON.parse(rawBody))` (Python: `json.dumps(json.loads(raw_body),
> separators=(",", ":"))`) as the HMAC input before concluding the secret is
> wrong. Log the raw body on your first few deliveries so you can compare.

> **No official SDK:** Fireflies does not publish a webhook SDK for Node.js or
> Python, so verification is implemented manually in every framework. The core
> is a standard HMAC-SHA256 hex digest, which the language standard libraries
> provide (`crypto` in Node, `hmac`/`hashlib` in Python).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyFirefliesWebhook(rawBody, signatureHeader, secret) {
  // Fail closed: no header or no configured secret means we cannot verify
  if (!signatureHeader || !secret) {
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
    # Fail closed: no header or no configured secret means we cannot verify
    if not signature_header or not secret:
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

### 1. No `sha256=` Prefix (V1 only)

In V1, Fireflies sends the digest as a bare hex string. Do **not** strip a
`sha256=` prefix (there isn't one) and do not expect one — compare the whole
header value.

Webhooks V2 is the opposite: it sends `X-Hub-Signature: sha256=<hex>`, so a V2
receiver *must* split off the prefix. Check an actual delivery before picking a
side — see [overview.md](overview.md#webhooks-v1-vs-v2).

```javascript
// WRONG - there is no prefix to strip; this mangles the signature
const signature = signatureHeader.replace('sha256=', '');

// CORRECT - use the header value as-is
crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), Buffer.from(expected, 'hex'));
```

### 2. Raw Body (Recommended Default, Not a Confirmed Fact)

Treat the signature as computed over the raw request body bytes. Parsing JSON
first and re-serializing can change the bytes — key order, whitespace, unicode
escaping — and that breaks verification whenever the provider signed the original
bytes.

**Express:**

```javascript
// RISKY - body is already parsed and re-serialized; the bytes may no longer match
app.use(express.json());
app.post('/webhooks/fireflies', (req, res) => {
  verifyFirefliesWebhook(JSON.stringify(req.body), ...);
});

// RECOMMENDED - use the raw body
app.post('/webhooks/fireflies',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyFirefliesWebhook(req.body, ...);
  }
);
```

In Next.js App Router, read `await request.text()` and verify that string. In
FastAPI, use `await request.body()` to get the raw bytes.

**The caveat:** as noted above, Fireflies' docs never state which form they sign,
and their worked example is behind an unreadable Replit link. Raw body is the
recommended default because it is correct in the widest set of cases, but it is
not confirmed against official docs. If raw body fails consistently, the
`JSON.stringify(parsedBody)` form is the next thing to try — capture the raw body
in your logs on the first deliveries so you can test both against the received
header.

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
