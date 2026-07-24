# How to Verify SHOPLINE Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Anyone can `POST` to it. Verifying the
`X-Shopline-Hmac-Sha256` signature proves the request really came from SHOPLINE
and that the body was not tampered with in transit. Never act on an unverified
webhook.

## How It Works

SHOPLINE signs every webhook request using **HMAC-SHA256**:

```
HMAC-SHA256(raw_request_body, app_secret)
```

- **Key:** your **app secret** from the Developer Center → App credentials
  (the same secret for every webhook — there is no per-endpoint secret).
- **Message:** the **raw, unparsed request body** bytes.
- **Header:** the digest is sent in `X-Shopline-Hmac-Sha256`.

### Encoding: base64 (with hex fallback)

SHOPLINE's documentation shows the header value as a **base64** digest
(Shopify-style), but a stray code sample in the docs shows a **hex** digest.
Rather than guess, compute the digest once and **timing-safe compare against
both the base64 and hex encodings** — the correct one matches, the other never
will.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyShoplineWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return [digest.toString('base64'), digest.toString('hex')].some((expected) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected));
    } catch {
      return false; // length mismatch → not a match
    }
  });
}

// Express — note express.raw() so req.body is the raw Buffer
app.post('/webhooks/shopline',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const hmac = req.headers['x-shopline-hmac-sha256'];
    if (!verifyShoplineWebhook(req.body, hmac, process.env.SHOPLINE_APP_SECRET)) {
      return res.status(400).send('Invalid signature');
    }
    // Verified — safe to parse and handle
    res.status(200).send('OK');
  }
);
```

### Python (manual — no official SDK)

SHOPLINE does not publish an official webhook SDK, so verify manually:

```python
import hmac
import hashlib
import base64

def verify_shopline_webhook(raw_body: bytes, hmac_header: str, secret: str) -> bool:
    if not hmac_header:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return (
        hmac.compare_digest(hmac_header, base64.b64encode(digest).decode("utf-8"))
        or hmac.compare_digest(hmac_header, digest.hex())
    )
```

## Common Gotchas

### 1. Use the raw body, not parsed JSON

The signature is computed over the exact bytes SHOPLINE sent. If you parse the
JSON and re-serialize it, key ordering and whitespace change and the HMAC will
never match.

```javascript
// WRONG — body already parsed and re-serialized
app.use(express.json());
verifyShoplineWebhook(JSON.stringify(req.body), hmac, secret); // fails!

// CORRECT — raw Buffer
app.post('/webhooks/shopline', express.raw({ type: 'application/json' }), ...);
```

In Next.js App Router, read `await request.text()` before `JSON.parse`. In
FastAPI, read `await request.body()` before parsing.

### 2. Header name casing

The header is `X-Shopline-Hmac-Sha256`. HTTP headers are case-insensitive, and
most frameworks lowercase them — read `x-shopline-hmac-sha256`.

### 3. Encoding assumptions

Do not hardcode only base64 or only hex. Accept **either** encoding (base64
documented, hex seen in a sample) so you are robust to whichever SHOPLINE sends.

### 4. Timing-safe comparison

Compare with `crypto.timingSafeEqual` / `hmac.compare_digest`, never `===`.
Wrap `timingSafeEqual` in try/catch — it throws on length mismatch, which should
just mean "invalid".

### 5. Replay protection (optional)

The docs suggest comparing a request timestamp against your system clock and
rejecting requests older than ~10 minutes. If you enforce this, keep in mind
SHOPLINE legitimately retries deliveries for up to 48 hours, so pair any replay
window with idempotency on `X-Shopline-Webhook-Id` rather than rejecting retries
outright.

## Debugging Verification Failures

```javascript
const digest = crypto.createHmac('sha256', secret).update(rawBody).digest();
console.log('body is Buffer:', Buffer.isBuffer(rawBody));
console.log('expected base64:', digest.toString('base64'));
console.log('expected hex   :', digest.toString('hex'));
console.log('received       :', hmacHeader);
```

- **Both expected values differ from received** → wrong secret (confirm you are
  using the **app secret**, not an API key/token) or the body was mutated before
  hashing.
- **Received looks like the base64 but comparison fails** → you are hashing
  parsed/re-serialized JSON instead of the raw body.

## Full Documentation

- [Generate and verify signatures](https://developer.shopline.com/docs/apps/api-instructions-for-use/generate-and-verify-signatures/)
- [SHOPLINE Webhooks overview](https://developer.shopline.com/docs/apps/api-instructions-for-use/webhooks/overview/)
