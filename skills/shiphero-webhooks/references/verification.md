# ShipHero Signature Verification

## How It Works

ShipHero signs every webhook request using **HMAC-SHA256** over the **raw JSON
request body**, base64-encoded, and sends it in the `x-shiphero-hmac-sha256`
header. The signing key is the `shared_signature_secret` returned once by the
`webhook_create` mutation.

The signature is computed as:

```
base64( HMAC-SHA256(raw_request_body, shared_signature_secret) )
```

This is a **plain HMAC of the raw body** — nothing is concatenated (no
`account_id`, no timestamp, no message id). ShipHero is **not** Standard Webhooks
compliant, so there are no `webhook-id` / `webhook-timestamp` / `webhook-signature`
headers.

There is **no official ShipHero SDK** for webhook verification, so verify
manually in every language/framework using the snippets below.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyShipHeroWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody) // rawBody is a Buffer / raw string — NOT parsed JSON
    .digest('base64');
  try {
    // timing-safe compare; returns false on length mismatch instead of throwing
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac
import hashlib
import base64

def verify_shiphero_webhook(raw_body: bytes, hmac_header: str, secret: str) -> bool:
    if not hmac_header:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(expected, hmac_header)
```

## Dispatching on the Event Type

ShipHero does **not** send a topic header. After verifying, parse the body and
switch on the `webhook_type` field:

```javascript
const payload = JSON.parse(rawBody.toString());
switch (payload.webhook_type) {
  case 'Order Allocated': /* ... */ break;
  case 'Shipment Update': /* ... */ break;
  // ...
}
```

## Common Gotchas

### 1. Raw Body Requirement

The signature is computed on the **raw request body**, not re-serialized JSON.
`JSON.stringify(req.body)` will not reproduce the exact bytes ShipHero signed
(key order, whitespace, unicode escaping differ), so verification fails.

**Express:**
```javascript
// WRONG - body is already parsed, bytes are lost
app.use(express.json());

// CORRECT - capture the raw body
app.post('/webhooks/shiphero',
  express.raw({ type: 'application/json' }),
  (req, res) => { verifyShipHeroWebhook(req.body, hmac, secret); }
);
```

### 2. Base64, Not Hex

ShipHero's signature is **base64**-encoded. Using `.digest('hex')` will never
match:

```javascript
.digest('hex')     // WRONG
.digest('base64')  // CORRECT
```

### 3. Timing-Safe Comparison

Always compare with a constant-time function to avoid timing attacks. Guard
against length-mismatch errors:

```javascript
// WRONG - vulnerable and throws on length mismatch
if (expected === hmacHeader) { ... }

// CORRECT - timing-safe, false on mismatch
try {
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
} catch { return false; }
```

### 4. Header Case

The header is `x-shiphero-hmac-sha256`. HTTP header names are case-insensitive,
but frameworks normalize them differently (Rack exposes it as
`HTTP_X_SHIPHERO_HMAC_SHA256`). Read it case-insensitively.

### 5. Respond Fast

ShipHero times out after ~10 seconds (20s for `Generate Label`) and retries up
to 5 times. Verify, enqueue, and return `2xx` with body
`{"code": "200", "Status": "Success"}` — do heavy work asynchronously.

## Debugging Verification Failures

### Compare the Hashes

```javascript
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
console.log('Body is Buffer:', Buffer.isBuffer(rawBody));
console.log('Computed:', expected);
console.log('Received:', hmacHeader);
console.log('Match:', expected === hmacHeader);
```

If they differ, the usual causes are (a) the body was parsed/re-serialized
before signing, (b) hex instead of base64, or (c) the wrong
`shared_signature_secret` (each webhook registration has its own secret).

## Full Documentation

- [ShipHero Webhook Verification](https://developer.shiphero.com/webhooks/#webhook_verification)
