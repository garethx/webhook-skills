# Clio Signature Verification

## How It Works

Clio proves that event deliveries are authentic by signing each one:

1. During the **handshake**, Clio gives your endpoint a shared secret via the
   `X-Hook-Secret` header (see [setup.md](setup.md)). You store it.
2. For every **event** delivery, Clio computes
   `HMAC-SHA256(shared_secret, raw_request_body)`, **hex**-encodes the digest,
   and sends it in the `X-Hook-Signature` header.
3. Your endpoint recomputes the same HMAC over the **raw** request body and
   compares it to `X-Hook-Signature` using a constant-time comparison.

There is no timestamp and no `sha256=` prefix — `X-Hook-Signature` is just the
lowercase hex digest.

| Property | Value |
|----------|-------|
| Algorithm | HMAC-SHA256 |
| Encoding | Hex (lowercase, 64 chars) |
| Header | `X-Hook-Signature` |
| Signed content | Raw request body (exact bytes) |
| Key | Shared secret from the `X-Hook-Secret` handshake |
| SDK | None — Clio has no official server SDK; verify manually |

## Implementation

Clio publishes no server SDK, so verification is manual in every language. Always
use the **raw** body — parsing then re-serializing JSON changes bytes (whitespace,
key order) and breaks the HMAC.

### Node.js

```javascript
const crypto = require('crypto');

function verifyClioWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // malformed or wrong-length hex
  }
}
```

### Python

```python
import hmac, hashlib

def verify_clio_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

## The Handshake Comes First

Do not run signature verification on the activation request. A POST that carries
an `X-Hook-Secret` header is the handshake — respond `200 OK` and echo the header
back. Only requests **without** `X-Hook-Secret` (i.e. carrying
`X-Hook-Signature`) are signed events to verify.

```javascript
const hookSecret = req.headers['x-hook-secret'];
if (hookSecret) {
  res.set('X-Hook-Secret', hookSecret); // confirm activation
  return res.status(200).end();
}
// otherwise: verify X-Hook-Signature ...
```

## Common Gotchas

- **Use the raw body.** Verify the exact received bytes. In Express use
  `express.raw()`; in Next.js use `await request.text()`; in FastAPI use
  `await request.body()`. Never `JSON.stringify(parsedBody)`.
- **Encoding is hex, not base64.** The digest is a 64-character lowercase hex
  string with no `sha256=` prefix.
- **Handshake before verification.** Verifying the `X-Hook-Secret` handshake POST
  will fail (it has no `X-Hook-Signature`); handle it separately.
- **Use the right secret.** Verify with the secret Clio delivered during the
  handshake for that specific webhook — not the OAuth client secret. With
  multiple webhooks, key the stored secret by `meta.webhook_id`.
- **Constant-time compare.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`, never `===`.
- **Header case.** HTTP headers are case-insensitive; frameworks usually expose
  them lowercased (`x-hook-signature`).

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Every event fails verification | Body was parsed/re-serialized before hashing — use the raw body |
| Works locally, fails in prod | A proxy/body-parser is mutating the body upstream |
| Handshake "fails" | You verified the `X-Hook-Secret` POST instead of echoing it back |
| Signature never matches | Wrong secret (used OAuth client secret, or a different webhook's secret) |
| `timingSafeEqual` throws | Comparing buffers of different lengths — wrap in try/catch and return false |
