# How to Verify Typeform Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public HTTPS URL. Anyone who discovers it can POST fake
submissions. Verifying the `Typeform-Signature` header proves the request was signed
with your secret and that the body wasn't tampered with in transit.

## How It Works

When a secret is configured on the webhook, Typeform signs **every** request:

```
signature = "sha256=" + base64( HMAC_SHA256( raw_request_body, secret ) )
```

The result is sent in the `Typeform-Signature` header. Key details:

- **Algorithm:** HMAC-SHA256
- **Encoding:** base64 (**not** hex — a common mistake)
- **Prefix:** the header value starts with the literal `sha256=`
- **Signed content:** the exact raw request body bytes, before any JSON parsing
- Typeform does **not** follow the Standard Webhooks spec (`webhook-id` / `webhook-timestamp` / `webhook-signature`), and there is no signature-verification SDK.

## Implementation

### Node.js (manual — no verification SDK exists)

```javascript
const crypto = require('crypto');

function verifyTypeformSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const expected = `sha256=${hash}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}
```

### Python (manual)

```python
import hmac
import hashlib
import base64

def verify_typeform_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    expected = "sha256=" + base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature_header)
```

## Common Gotchas

### 1. Raw body required

Compute the HMAC over the **raw** request body. If you parse JSON first and
re-serialize it, whitespace and key ordering change and the signature will never
match.

**Express** — use `express.raw()` on the webhook route:

```javascript
// WRONG - body is already parsed and re-serialized
app.use(express.json());
app.post('/webhooks/typeform', (req, res) => {
  verifyTypeformSignature(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT - raw Buffer
app.post('/webhooks/typeform',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyTypeformSignature(req.body, req.headers['typeform-signature'], secret);
  }
);
```

**Next.js App Router** — read the body with `await request.text()` before parsing.

**FastAPI** — use `await request.body()` (bytes), not the parsed model.

### 2. Base64, not hex

```javascript
// WRONG - hex
.digest('hex')
// CORRECT - base64
.digest('base64')
```

### 3. Keep the `sha256=` prefix

The header value includes the `sha256=` prefix. Build your expected value **with**
the prefix and compare the whole strings — don't strip it off one side only.

### 4. Timing-safe comparison

Use `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python) rather than
`===`/`==` to avoid leaking information through comparison timing. Wrap
`timingSafeEqual` in try/catch — it throws when the two buffers differ in length.

### 5. No secret = no header

The `Typeform-Signature` header is only sent when a secret is configured on the
webhook. If the header is missing, either add a secret in the webhook settings or
treat the request as unverifiable and reject it.

## Debugging Verification Failures

```javascript
app.post('/webhooks/typeform', express.raw({ type: 'application/json' }), (req, res) => {
  const received = req.headers['typeform-signature'];
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.TYPEFORM_WEBHOOK_SECRET)
    .update(req.body)
    .digest('base64');
  console.log('Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('Received:', received);
  console.log('Expected:', expected);
  console.log('Match:', received === expected);
});
```

If `expected` doesn't match, check (in order): the secret value, that the body is
the raw bytes, that you used base64, and that the `sha256=` prefix is present on
both sides.

## Full Documentation

See Typeform's
[Secure your webhooks](https://www.typeform.com/developers/webhooks/secure-your-webhooks/)
guide for the authoritative reference.
