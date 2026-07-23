# How to Verify Nylas Webhook Signatures

## How It Works

Every Nylas webhook POST includes an **`x-nylas-signature`** header (read it
case-insensitively — casing varies by proxy/framework). Its value is a **hex-encoded
HMAC-SHA256** digest computed over the **exact raw request body**, keyed with your
destination's **`webhook_secret`**.

To verify:

1. Read the **raw body bytes** — before any JSON parsing or re-serialization.
2. Compute `HMAC-SHA256(raw_body, webhook_secret)` and hex-encode it (64 hex chars).
3. Compare it to the `x-nylas-signature` header using a **constant-time** comparison.
4. Only after it matches, parse the JSON and handle the event.

This is **not** Standard Webhooks — there is no `webhook-id` or `webhook-timestamp`
header, and no timestamp is folded into the signed content. **Only the body is signed.**

## Why Signature Verification Matters

Your webhook URL is public. Without verification, anyone who learns it can POST forged
`message.created` or `grant.expired` events. The HMAC proves the request was produced by
someone holding the `webhook_secret` — i.e. Nylas.

## Implementation

### SDK Verification (not available)

The official Nylas SDKs (Node `nylas`, Python `nylas`) expose webhook **CRUD**,
`rotateSecret`, `ipAddresses`, and a challenge-parameter helper — but **no
signature-verification helper**. Implement the HMAC check manually as below.

### Manual Verification — Node.js

```javascript
const crypto = require('crypto');

function verifyNylasSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // different lengths => invalid
  }
}
```

### Manual Verification — Python

```python
import hmac, hashlib

def verify_nylas_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

## Gzip / Compressed Delivery (Critical Gotcha)

If you enable **compressed delivery**, Nylas sets `Content-Encoding: gzip` and the
signature covers the **compressed bytes**. So:

1. Verify `x-nylas-signature` against the **raw gzip body** first.
2. **Only after** the check passes, decompress and parse.

Verifying against decompressed bytes is the single most common cause of *valid*
notifications failing the check. If your framework or proxy transparently gunzips the
body, capture the compressed bytes before that happens.

```javascript
const zlib = require('zlib');
// rawBody is the exact bytes received (still gzipped if Content-Encoding: gzip)
if (!verifyNylasSignature(rawBody, sig, secret)) return res.status(401).send('Invalid signature');
const json = req.headers['content-encoding'] === 'gzip'
  ? zlib.gunzipSync(rawBody).toString('utf8')
  : rawBody.toString('utf8');
const payload = JSON.parse(json);
```

## Common Gotchas

- **Raw body required.** Signing a re-serialized JSON object will not match — whitespace
  and key order differ. Use `express.raw()`, `await request.text()` (Next.js), or
  `await request.body()` (FastAPI).
- **Gzip covers compressed bytes.** See above.
- **Header casing varies.** Look up `x-nylas-signature` case-insensitively.
- **Hex, not base64.** The digest is a 64-character lowercase hex string.
- **Constant-time compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`, never
  `===`/`==`.
- **Challenge handshake is separate.** The GET `?challenge=` step is endpoint ownership
  verification, not signature verification — it has no signature and just echoes the value.

## How to Debug Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every request fails | Wrong secret, or verifying parsed JSON | Use the destination's `webhook_secret`; verify raw bytes |
| Fails only with compression on | Verifying decompressed body | Verify the gzip bytes, decompress after |
| `timingSafeEqual` throws | Header not hex / length mismatch | Catch and return `false`; confirm hex encoding |
| Works locally, fails behind proxy | Proxy re-encoded/gunzipped body | Capture raw bytes at the edge; disable body transforms |
| Signature header missing | Reading wrong header name/case | Read `x-nylas-signature` case-insensitively |
