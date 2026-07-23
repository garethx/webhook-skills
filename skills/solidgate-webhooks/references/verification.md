# How to Verify Solidgate Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Anyone who discovers it can POST fake
payment or subscription events. Verifying the `signature` header proves the request
was signed with your webhook secret key (`wh_sk_`) and that the body was not
tampered with in transit.

## How It Works

Solidgate does **not** use the Standard Webhooks spec. Each delivery carries two
headers:

- `merchant` — your webhook **public** key (`wh_pk_…`)
- `signature` — the HMAC to verify

The signature is computed with the same HMAC-SHA512 scheme Solidgate uses for API
requests, but with your **webhook** key pair:

```
message   = publicKey + rawBody + publicKey
hexDigest = HMAC_SHA512(secretKey, message).hex()      # lowercase hex string
signature = base64(hexDigest)                          # Base64 of the HEX STRING
```

### The double-encode gotcha

The most common mistake is Base64-encoding the **raw digest bytes**. Solidgate
Base64-encodes the **hexadecimal string** of the digest. The official SDKs do
exactly this:

- Python (`solidgate-sdk`): `base64.b64encode(hmac_hash.hexdigest().encode('utf-8'))`
- Node (`@solidgate/node-sdk`): `Buffer.from(hash.toString(/* hex */)).toString('base64')`

So the input to Base64 is a 128-character hex string, not 64 bytes.

## Implementation

There is **no public webhook-verification helper** in either the Node
(`@solidgate/node-sdk`) or Python (`solidgate-sdk`) SDK — their signing methods
are private and built for outbound API calls. Verify manually, matching the
algorithm above.

### Node.js (manual)

```javascript
const crypto = require('crypto');

function verifySolidgate(rawBody, signature, publicKey, secretKey) {
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const hex = crypto.createHmac('sha512', secretKey)
    .update(publicKey + body + publicKey)
    .digest('hex');
  const expected = Buffer.from(hex).toString('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // buffer length mismatch = invalid
  }
}
```

### Python (manual)

```python
import base64, hashlib, hmac

def verify_solidgate(raw_body: bytes, signature: str, public_key: str, secret_key: str) -> bool:
    message = public_key.encode() + raw_body + public_key.encode()
    hex_digest = hmac.new(secret_key.encode(), message, hashlib.sha512).hexdigest()
    expected = base64.b64encode(hex_digest.encode()).decode()
    return hmac.compare_digest(expected, signature)
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes received. Any JSON
  re-serialization (key reordering, whitespace changes) breaks the signature.
- **The public key wraps the body.** The signed message is
  `publicKey + body + publicKey`, not just the body.
- **Base64 the hex string, not the digest bytes.** See "double-encode" above.
- **Use the webhook key pair.** `wh_pk_` / `wh_sk_`, not your API keys.
- **SHA-512, not SHA-256.** Solidgate uses HMAC-SHA512.
- **Timing-safe comparison.** Compare with `crypto.timingSafeEqual` /
  `hmac.compare_digest`, wrapped so length mismatches return `false` instead of
  throwing.

## Which public key to use

The `message` needs a public key. Use your **configured** `wh_pk_` from the
environment rather than blindly trusting the inbound `merchant` header — the
examples in this skill also check that the `merchant` header equals your configured
public key, so a request signed for a different merchant is rejected.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid, even for real events | Body was parsed/re-serialized before verifying — capture the raw body |
| Works in tests, fails in production | Using API keys instead of webhook keys (`wh_pk_`/`wh_sk_`) |
| Signature length looks wrong | Base64-encoded the raw digest bytes instead of the hex string |
| Intermittent failures | Framework middleware mutating the body; ensure raw-body capture runs first |
