# How to Verify Tebex Webhook Signatures

## How It Works

Tebex signs every webhook with a hex-encoded HMAC in the **`X-Signature`**
header. The signature is built in **two steps**:

1. Compute the SHA-256 hash of the **raw** request body → a 64-char hex string.
2. Compute an HMAC-SHA256 of that hex string, keyed with your **webhook
   secret** → the value you compare against `X-Signature`.

In PHP (from Tebex's docs) this is:

```php
hash_hmac('sha256', hash('sha256', $body), $secret)
```

This is **not** a plain HMAC of the body — the body is hashed first, then that
hash is HMAC'd. Tebex does not provide an SDK, so verify manually.

## Implementation

Tebex ships no SDK, so every framework verifies manually with the same
two-step algorithm.

### Node.js

```javascript
const crypto = require('crypto');

function verifyTebexSignature(rawBody, signatureHeader, secret) {
  // Step 1: SHA-256 of the raw body (hex)
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  // Step 2: HMAC-SHA256 of that hash, keyed with the secret (hex)
  const expected = crypto.createHmac('sha256', secret).update(bodyHash).digest('hex');

  const received = Buffer.from(signatureHeader || '');
  const expectedBuf = Buffer.from(expected);
  // Length check avoids timingSafeEqual throwing on mismatched buffers
  return received.length === expectedBuf.length &&
    crypto.timingSafeEqual(received, expectedBuf);
}
```

### Python

```python
import hashlib
import hmac

def verify_tebex_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    # Step 1: SHA-256 of the raw body (hex)
    body_hash = hashlib.sha256(raw_body).hexdigest()
    # Step 2: HMAC-SHA256 of that hash, keyed with the secret (hex)
    expected = hmac.new(secret.encode(), body_hash.encode(), hashlib.sha256).hexdigest()
    # compare_digest is constant-time
    return hmac.compare_digest(expected, signature or "")
```

## The Validation Handshake

`validation.webhook` events are signed exactly like any other event — verify
the signature first, then echo the `id` back:

```javascript
if (event.type === 'validation.webhook') {
  return res.status(200).json({ id: event.id });
}
```

Failing to echo the `id` (or returning a non-200) leaves the endpoint inactive.

## Optional: Source IP Allowlist

Tebex sends only from `18.209.80.3` and `54.87.231.232`. As an extra layer you
can reject other sources with a `404`:

```javascript
const TEBEX_IPS = new Set(['18.209.80.3', '54.87.231.232']);

// Behind a proxy/load balancer, read the real client IP from the
// appropriate forwarded header instead of req.ip.
if (!TEBEX_IPS.has(req.ip)) {
  return res.status(404).end();
}
```

Signature verification is the primary defense — treat the IP check as optional,
since tunnels, proxies, and load balancers can change the observed source IP.

## Common Gotchas

### 1. Raw body is required

The most common failure is hashing a re-serialized JSON body. Frameworks like
Express parse JSON automatically, and `JSON.stringify(req.body)` will not match
the exact bytes Tebex signed (key order, whitespace, and escaping differ).
Always compute the signature over the **raw** request body.

**Express:**
```javascript
// WRONG — body is already parsed, re-serializing changes the bytes
app.use(express.json());
app.post('/webhooks/tebex', (req, res) => {
  verifyTebexSignature(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT — capture the raw body for this route
app.post('/webhooks/tebex',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyTebexSignature(req.body, ...); // Works!
  }
);
```

### 2. Two-step construction

It is `HMAC(secret, SHA256(body))`, not `HMAC(secret, body)`. Hash the body
first, then HMAC the resulting hex string. A single-step HMAC will never match.

### 3. Header casing

HTTP headers are case-insensitive. Read `x-signature` — Node lowercases header
keys (`req.headers['x-signature']`), and `request.headers.get('x-signature')`
works in Next.js and FastAPI.

### 4. Always return 2XX

Return a 2XX for handled events. Non-2XX responses trigger Tebex retries and can
eventually deactivate the endpoint.

## Debugging Verification Failures

1. **Log the raw body type/length** — it should be a `Buffer`/`bytes`, not a
   parsed object.
2. **Confirm the two-step order** — SHA-256 the body, then HMAC the hex hash.
3. **Check the secret** — copy it fresh from **Developers → Webhooks →
   Endpoints**; a trailing space or wrong store's secret breaks the match.
4. **Compare hex, not bytes** — both the computed value and `X-Signature` are
   lowercase hex strings of the same length (64 chars).

## Full Documentation

See [Tebex's webhook verification docs](https://docs.tebex.io/developers/webhooks/overview#verifying-webhook-authenticity).
