# Pylon Signature Verification

## How It Works

Pylon signs every webhook delivery with **HMAC-SHA256**. The signed content is
the concatenation of the timestamp header, a literal `.`, and the **raw** request
body:

```
signed_content = Pylon-Webhook-Timestamp + "." + raw_body
signature      = "hs256=" + hex( HMAC_SHA256(secret, signed_content) )
```

The result is sent in the `Pylon-Webhook-Signature` header, prefixed with
`hs256=`. Two companion headers travel with it:

- `Pylon-Webhook-Timestamp` — Unix seconds, and part of the signed content.
- `Pylon-Webhook-Version` — payload schema version (e.g. `2021-07`).

To verify, recompute the HMAC over `timestamp + "." + rawBody` with your
destination's secret, prepend `hs256=`, and compare against the header with a
timing-safe comparison.

There is **no official Pylon SDK**, so verify manually in every language.

## Implementation

### Node.js (manual, `node:crypto`)

```javascript
const crypto = require('crypto');

function verifyPylonWebhook(rawBody, timestamp, signatureHeader, secret) {
  if (!signatureHeader || !timestamp) return false;

  // Pylon signs timestamp + "." + rawBody. rawBody must be the unparsed body.
  const expected = 'hs256=' + crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // different lengths → invalid
  }
}
```

### Python (manual, `hmac`)

```python
import hmac, hashlib

def verify_pylon_webhook(raw_body: bytes, timestamp: str,
                         signature_header: str, secret: str) -> bool:
    if not signature_header or not timestamp:
        return False
    signed = timestamp.encode() + b"." + raw_body
    expected = "hs256=" + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

> Note: Pylon's published Python snippet passes a `str` secret straight to
> `hmac.new`, which raises in Python 3. Encode the secret and the signed content
> to bytes as shown above.

## Common Gotchas

- **Use the raw body.** Compute the HMAC over the exact bytes Pylon sent. If you
  `JSON.parse` and re-serialize, key order/whitespace changes and the signature
  will not match. In Express use `express.raw()`; in Next.js use
  `await request.text()`; in FastAPI use `await request.body()`.
- **Include the timestamp.** The signed content is `timestamp + "." + body`, not
  the body alone. Forgetting the `timestamp.` prefix is the most common failure.
- **Keep the `hs256=` prefix.** The header value includes `hs256=`. You can either
  compare the full `hs256=<hex>` strings (as above) or strip the prefix from both
  sides — just be consistent.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`, not `===`/`==`. `timingSafeEqual` throws on length
  mismatch, so wrap it in try/catch and return `false`.
- **Secret is shown once.** Pylon reveals the destination secret only at creation
  time. Store it securely; you cannot read it back later.

## Legacy `X-Pylon-Signature` Scheme

An older Pylon support article documents a different header,
`X-Pylon-Signature`: a hex HMAC-SHA256 of the **raw body only** — no timestamp,
no `hs256=` prefix. This is legacy. Implement the `Pylon-Webhook-Signature`
scheme above as your primary path; only fall back to `X-Pylon-Signature` if your
destination predates the current format.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Signature never matches | Body was parsed/re-serialized — verify against the raw bytes |
| Signature never matches | Signed content omitted the `timestamp.` prefix |
| Signature never matches | Compared against `X-Pylon-Signature` (legacy) instead of `Pylon-Webhook-Signature` |
| `timingSafeEqual` throws | Buffers differ in length — catch and return `false` |
| Works locally, fails in prod | Wrong `PYLON_WEBHOOK_SECRET` (per-destination secret mismatch) |
| Python `TypeError` | `str` passed to `hmac.new`; encode secret/content to bytes |
