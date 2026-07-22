# How to Verify Recharge Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Verifying the `X-Recharge-Hmac-Sha256` signature proves the
request genuinely came from Recharge and that the body was not tampered with in transit. Reject any
request that fails verification with a `4xx` status before acting on it.

## How It Works (the big gotcha)

Despite the header being named `X-Recharge-Hmac-Sha256`, **Recharge does not use HMAC**. The signature is
a plain **SHA-256** hash of the **API Client Secret concatenated directly with the raw request body**,
with the **secret placed first**, then hex-encoded:

```
signature = SHA256( client_secret + raw_request_body )   // hex-encoded
```

This is the single most common source of Recharge verification failures — people reach for
`crypto.createHmac(...)` / `hmac.new(...)` and never match. Use a plain hash and **prepend the secret**.

Recharge's own documented Python example makes the construction explicit:

```python
import hashlib

def is_webhook_valid(client_secret, request_body, webhook_hmac):
    calculated = hashlib.sha256()
    calculated.update(client_secret.encode("UTF-8"))  # secret first
    calculated.update(request_body.encode("UTF-8"))   # then the raw body
    return calculated.hexdigest() == webhook_hmac
```

> The docs stress byte-exactness: "validation will fail even if one space is lost." Always hash the
> **raw** request body bytes, never a re-serialized/parsed version.

## Implementation

There is **no official Recharge SDK for webhook verification** — `@rechargeapps/storefront-client`
covers only the Storefront API. Verify manually in every framework.

### Node.js

```javascript
const crypto = require('crypto');

function verifyRechargeWebhook(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader) return false;
  // Plain SHA-256 of (clientSecret + rawBody). NOT HMAC. Secret is prepended.
  const digest = crypto
    .createHash('sha256')
    .update(clientSecret)   // secret first
    .update(rawBody)        // then the raw body (Buffer or string)
    .digest('hex');
  try {
    // Timing-safe compare; throws on length mismatch, which we treat as invalid.
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
```

### Python

```python
import hashlib
import hmac  # only for compare_digest (constant-time comparison)

def verify_recharge_webhook(raw_body: bytes, signature_header: str, client_secret: str) -> bool:
    if not signature_header:
        return False
    # Plain SHA-256 of (client_secret + raw_body). NOT HMAC. Secret is prepended.
    digest = hashlib.sha256(client_secret.encode("utf-8") + raw_body).hexdigest()
    return hmac.compare_digest(digest, signature_header)
```

## Common Gotchas

### 1. It is NOT HMAC

Using `crypto.createHmac('sha256', secret)` (Node) or `hmac.new(secret, body, sha256)` (Python) will
**never** match. Use a plain SHA-256 hash and concatenate the secret in front of the body.

### 2. Secret goes first

The order is `secret + body`, not `body + secret`. Reversing it fails.

### 3. Use the raw body

Compute the hash over the exact bytes Recharge sent. If you let your framework parse the JSON and then
re-serialize it, key ordering and whitespace change and the hash won't match.

- **Express:** mount `express.raw({ type: 'application/json' })` on the route and hash `req.body`
  (a `Buffer`). Do not apply `express.json()` to this route.
- **Next.js App Router:** read `await request.text()` and hash that string. Do not `await request.json()`
  first.
- **FastAPI:** read `await request.body()` (bytes) and hash that. Do not use a Pydantic model / parsed body.

### 4. Hex, not base64

The digest is hex-encoded (64 lowercase hex characters). Don't `.digest('base64')`.

### 5. Client Secret, not access token

Verification uses the **API Client Secret** from your API token's settings — not the
`X-Recharge-Access-Token` value you use to call the API.

### 6. Use a constant-time comparison

Compare with `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python) to avoid timing attacks.
A plain `===` / `==` leaks information about how many characters matched.

## Debugging Verification Failures

```javascript
const digest = crypto.createHash('sha256').update(secret).update(rawBody).digest('hex');
console.log('Body is Buffer:', Buffer.isBuffer(rawBody));
console.log('Body length:', rawBody.length);
console.log('Computed:', digest);
console.log('Received:', signatureHeader);
console.log('Match:', digest === signatureHeader);
```

If they don't match, check, in order: (1) you're using a plain hash, not HMAC; (2) the secret is
prepended, not appended; (3) you're hashing the raw body, not parsed-then-reserialized JSON; (4) the
secret is the **API Client Secret**; (5) output is hex.

## Full Documentation

- [Validating webhooks](https://docs.getrecharge.com/docs/webhooks-overview#validating-webhooks)
