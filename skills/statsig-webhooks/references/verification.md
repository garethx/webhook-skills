# Statsig Signature Verification

## How It Works

Statsig signs every webhook request using HMAC SHA-256. Two headers are sent:

- `X-Statsig-Request-Timestamp` - The time Statsig sent the request (epoch milliseconds)
- `X-Statsig-Signature` - The signature, formatted as `v0=<hex digest>`

The signature is computed over a **basestring** built by joining three parts with colons:

```
v0:<timestamp>:<raw_request_body>
```

For example:

```
v0:1671672194836:{"data":[...]}
```

The HMAC-SHA256 of that basestring (keyed by your signing secret, hex-encoded) is prefixed with `v0=` to form the value sent in `X-Statsig-Signature`.

## Implementation

Statsig does not ship an SDK helper for inbound webhook verification, so compute the signature yourself and compare it to the header.

**Node.js:**
```javascript
const crypto = require('crypto');

function verifyStatsigWebhook(rawBody, timestamp, signatureHeader, secret) {
  if (!timestamp || !signatureHeader) return false;

  const basestring = `v0:${timestamp}:${rawBody}`;
  const expected =
    'v0=' + crypto.createHmac('sha256', secret).update(basestring).digest('hex');

  const sigBuf = Buffer.from(signatureHeader, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}
```

**Python:**
```python
import hmac
import hashlib

def verify_statsig_webhook(raw_body: bytes, timestamp: str, signature_header: str, secret: str) -> bool:
    if not timestamp or not signature_header:
        return False
    basestring = b"v0:" + timestamp.encode("utf-8") + b":" + raw_body
    expected = "v0=" + hmac.new(secret.encode("utf-8"), basestring, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

## Common Gotchas

### 1. Raw Body Requirement

The signature is computed over the exact bytes Statsig sent. If you parse the JSON and re-serialize it, the bytes change (key order, whitespace) and verification fails. Always verify against the **raw** request body, then parse.

**Express:**
```javascript
// Use the raw body parser for the webhook route
app.post('/webhooks/statsig',
  express.raw({ type: 'application/json' }),
  handleWebhook
);
```

### 2. Include the Timestamp in the Basestring

A common mistake is signing only the body. The basestring is `v0:<timestamp>:<body>` — the version prefix and the `X-Statsig-Request-Timestamp` value are part of the signed string.

### 3. Keep the `v0=` Prefix

The header value is `v0=<hex>`, not the bare hex digest. Prefix your computed digest with `v0=` before comparing, or strip the prefix from the header before comparing the hex parts — just be consistent.

### 4. Use a Timing-Safe Comparison

Compare with `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python) rather than `===`/`==` to avoid leaking information through timing.

### 5. Replay Protection (Optional)

The signed timestamp lets you reject stale requests. If you want replay protection, compare `X-Statsig-Request-Timestamp` against the current time and reject requests outside an acceptable window (e.g. a few minutes).

## Debugging Verification Failures

1. **Log the raw body type** — it should be a `Buffer`/`bytes`/`string`, not a parsed object.
2. **Check both headers are present** — `X-Statsig-Request-Timestamp` and `X-Statsig-Signature`.
3. **Confirm the basestring** — `v0:<timestamp>:<rawBody>` with colon separators and no extra whitespace.
4. **Verify the secret** — ensure `STATSIG_WEBHOOK_SECRET` matches the signing secret from the webhook configuration.

## Full Documentation

For complete signature verification details, see [Statsig's Event Webhook documentation](https://docs.statsig.com/integrations/event_webhook).
