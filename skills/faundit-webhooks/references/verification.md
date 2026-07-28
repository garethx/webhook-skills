# How to Verify Faundit Webhook Signatures

## How It Works

Faundit signs every webhook with **HMAC-SHA256** and hex-encodes the result. There are two
schemes; new integrations should use the **v1** scheme.

### v1 (current, recommended) — `X-Faundit-Signature-Next`

The signature covers the timestamp **and** the raw body, so it protects against payload
tampering. The signed string is:

```
v1:<timestamp>:<body>
```

where:
- `<timestamp>` is the value of the `X-Faundit-Timestamp` header, and
- `<body>` is the **raw, unparsed** request body.

```
X-Faundit-Signature-Next = HMAC_SHA256(secret, "v1:" + timestamp + ":" + rawBody)  → hex
```

### v0 (deprecated) — `X-Faundit-Signature`

The legacy scheme signs only the timestamp:

```
v0:<timestamp>
```

Because the body is not part of the signed content, v0 provides **no payload integrity**.
Avoid it; prefer `X-Faundit-Signature-Next`.

There is **no official Faundit SDK**, so verify manually in every framework.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyFaunditWebhook(rawBody, timestamp, signatureNext, secret) {
  if (!signatureNext || !timestamp) return false;

  const signedContent = `v1:${timestamp}:${rawBody}`; // rawBody = raw request body
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureNext, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // length mismatch = invalid
  }
}
```

### Python

```python
import hmac
import hashlib

def verify_faundit_webhook(raw_body: bytes, timestamp: str, signature_next: str, secret: str) -> bool:
    if not signature_next or not timestamp:
        return False

    # raw_body is bytes; the signed string is "v1:<timestamp>:<body>"
    signed_content = b"v1:" + timestamp.encode("utf-8") + b":" + raw_body
    expected = hmac.new(
        secret.encode("utf-8"),
        signed_content,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature_next, expected)
```

## Common Gotchas

### 1. Use the raw body, not parsed JSON

The signature is computed over the exact bytes Faundit sent. If you parse the JSON and
re-serialize it, key order and whitespace change and the signature will not match.

**Express:**
```javascript
// WRONG - body is already parsed and re-stringified
app.use(express.json());
app.post('/webhooks/faundit', (req, res) => {
  verifyFaunditWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT - use the raw body
app.post('/webhooks/faundit',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyFaunditWebhook(req.body.toString(), ...); // Works!
  }
);
```

### 2. Include the `v1:` prefix and the timestamp

The signed string is `v1:<timestamp>:<body>` — not just the body. Forgetting the `v1:`
prefix or the `X-Faundit-Timestamp` value is the most common cause of mismatches.

### 3. Prefer `X-Faundit-Signature-Next` (v1) over `X-Faundit-Signature` (v0)

The deprecated v0 header signs only `v0:<timestamp>` and does not cover the body. Verifying
v0 does not protect you from a tampered payload. Always verify the `-Next` header.

### 4. Hex encoding, not base64

Faundit's signature is hex-encoded:

```javascript
.digest('hex')   // CORRECT
.digest('base64') // WRONG
```

### 5. Timing-safe comparison

Always compare with a constant-time function (`crypto.timingSafeEqual` /
`hmac.compare_digest`) to avoid leaking information via timing. Wrap the Node comparison in
`try/catch` because `timingSafeEqual` throws on buffers of different lengths.

## Debugging Verification Failures

### Log the pieces you sign

```javascript
console.log('timestamp:', timestamp);
console.log('rawBody is Buffer:', Buffer.isBuffer(req.body));
console.log('signed:', `v1:${timestamp}:${req.body.toString()}`);
console.log('received:', req.headers['x-faundit-signature-next']);
console.log('computed:', crypto.createHmac('sha256', secret)
  .update(`v1:${timestamp}:${req.body.toString()}`).digest('hex'));
```

### Check your secret

Ensure the secret matches exactly what Faundit provided (from tech@faundit.com). Watch for:
- Leading/trailing whitespace
- Copy-paste errors
- Using an API key instead of the webhook signing secret

## Full Documentation

For complete verification details, see
[Faundit's webhook documentation](https://faundit.gitbook.io/faundit-api-v2/webhooks).
