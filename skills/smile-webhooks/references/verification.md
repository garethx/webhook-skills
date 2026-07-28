# How to Verify Smile API Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Anyone can POST to it. Signature
verification proves a delivery genuinely came from Smile and was not tampered
with in transit. Skipping it lets an attacker forge employment/income events.

## How It Works

Smile signs each webhook and sends the signature in a header:

| Property | Value |
|----------|-------|
| Header name | `Smile-Signature` (no `X-` prefix) |
| Algorithm | **HMAC-SHA512** |
| Encoding | **hex** |
| Signed content | The **entire raw request body**, unmodified |
| Key | The per-endpoint **secret** (1–64 chars) set at registration |

Smile computes `hex( HMAC-SHA512(secret, rawBody) )` and puts the result in
`Smile-Signature`. You recompute the same digest with your stored secret and
compare in constant time.

> This is **not** the Standard Webhooks spec (no `webhook-id` /
> `webhook-timestamp` / `webhook-signature` headers) and **not** SHA-256. There
> is no timestamp in the signed content.

## Implementation

There is **no official Smile SDK**, so verification is manual in every language.

### Node.js

```javascript
const crypto = require('crypto');

function verifySmileSignature(rawBody, signatureHeader, secret) {
  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody) // Buffer/raw string — NOT JSON.stringify(parsed)
    .digest('hex');
  const received = Buffer.from(String(signatureHeader || ''), 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  return (
    received.length === computed.length &&
    crypto.timingSafeEqual(received, computed)
  );
}
```

### Python

```python
import hashlib
import hmac

def verify_smile_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,            # raw bytes — NOT json.dumps(parsed)
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")
```

## Common Gotchas

- **Use the raw body.** Sign the exact bytes Smile sent. If you parse JSON and
  re-serialize it (`JSON.stringify` / `json.dumps`), key order and whitespace
  change and the signature will never match. Capture the raw body **before**
  parsing.
- **No extra whitespace.** Digest the payload with no leading or trailing
  whitespace — the raw body exactly as received.
- **SHA-512, not SHA-256.** A common copy-paste mistake from other providers.
- **hex, not base64.** The digest is hex-encoded.
- **Header name is `Smile-Signature`.** No `X-` prefix. HTTP header lookups are
  case-insensitive, but the value is case-sensitive.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`. Guard against unequal lengths — Node's
  `timingSafeEqual` throws when the buffers differ in length.
- **Verify before parsing.** Only `JSON.parse` after the signature check passes.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Signature never matches | Body was parsed + re-serialized; sign the **raw** body instead |
| Signature never matches | Using SHA-256 instead of **SHA-512**, or base64 instead of **hex** |
| Signature never matches | Wrong `SMILE_WEBHOOK_SECRET` (each endpoint has its own secret) |
| `timingSafeEqual` throws | Buffers differ in length — guard the length before comparing |
| Header is missing | Reading the wrong header name — it is `Smile-Signature` |

## After Verifying

1. Parse the JSON body.
2. **Dedupe on the event `id`** — Smile retries up to 2 times, so the same event
   can arrive more than once.
3. Dispatch on the `type` field.
4. Respond `2xx` quickly; do heavy work asynchronously so slow processing does
   not trigger retries.
