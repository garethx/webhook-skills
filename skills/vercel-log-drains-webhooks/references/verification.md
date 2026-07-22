# Vercel Log Drains Signature Verification

## How It Works

Vercel signs each **signed** delivery so you can confirm the request really came
from Vercel:

- **Header:** `x-vercel-signature`
- **Algorithm:** HMAC-**SHA1** (not SHA256)
- **Encoding:** lowercase **hex** digest (the raw digest, with **no** `sha1=`
  prefix — unlike GitHub)
- **Signed content:** the **raw request body** bytes, exactly as received
- **Secret:** the drain's auto-generated **signature secret** (Team Settings →
  Drains → Edit), stored as `VERCEL_LOG_DRAIN_SECRET`

This is **not** Standard Webhooks — there is no `webhook-id` / `webhook-timestamp`
/ `webhook-signature` triple and no timestamp in the signed payload.

## The `x-vercel-verify` Handshake

When a drain is created or tested, Vercel sends an **unsigned** probe (no
`x-vercel-signature`). Your endpoint proves ownership by returning the
verification token in the `x-vercel-verify` **response header**.

Practical handling:

1. Set the `x-vercel-verify` response header from `VERCEL_VERIFY` on every
   response (safe to always include).
2. If the request has **no** `x-vercel-signature`, treat it as the handshake:
   respond `200` and do not attempt to parse or process logs.
3. If the request **has** `x-vercel-signature`, verify it; reject invalid
   signatures with `403`.

## Implementation

Vercel does not ship an SDK method for verifying drain deliveries — the official
docs show manual HMAC-SHA1. Use manual verification in every framework.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyVercelSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody) // raw body Buffer/string — do NOT re-serialize
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // wrong length or non-hex header
  }
}
```

### Python (FastAPI)

```python
import hmac
import hashlib

def verify_vercel_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

## Parsing the Batch After Verification

Verify **before** parsing. The body is either a JSON array or NDJSON:

```javascript
function parseLogs(rawBody) {
  const text = rawBody.toString('utf8').trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text);          // JSON array
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l)); // NDJSON
}
```

## Common Gotchas

- **Use the raw body.** Signing a re-serialized JSON object (re-ordered keys,
  changed whitespace) produces a different digest. Read the raw bytes/string
  before any JSON parsing.
- **SHA1, not SHA256.** Vercel drains use HMAC-SHA1. Copy-pasting a SHA256
  verifier from another provider silently fails.
- **No `sha1=` prefix.** The header value is the bare hex digest. Do not strip a
  prefix (there isn't one) and do not add one when comparing.
- **Handshake requests are unsigned.** Don't reject a missing `x-vercel-signature`
  with `403` — that would fail the create/test handshake. Return `200` with the
  `x-vercel-verify` header instead.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`.
  Guard `timingSafeEqual` against length mismatches (it throws) by catching.
- **gzip.** Vercel doesn't document whether the signature covers the compressed
  or decompressed bytes when compression is enabled. If you turn it on, test a
  real delivery against both (start with the decompressed bytes) — or leave
  compression off to avoid the ambiguity.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every signed delivery is 403 | Wrong secret, or you're hashing parsed JSON instead of the raw body |
| Works locally, fails in prod | A proxy/body parser mutated the body before your handler saw it |
| Digest length error / always false | Comparing hex string lengths mismatched, or using SHA256 |
| Drain won't verify on creation | Endpoint not echoing `x-vercel-verify`, or returning non-200 to the unsigned probe |

Official reference:
[Drains Security](https://vercel.com/docs/drains/security) ·
[Log Drains Reference](https://vercel.com/docs/drains/reference/logs)
