# How to Verify Utila Webhook Signatures

## How It Works

Utila uses **asymmetric** signatures — not HMAC. Each delivery is signed with an
**RSA-4096 private key** that only Utila holds. You verify with the matching
**public key** from the Console.

| Property | Value |
|----------|-------|
| Header | `x-utila-signature` |
| Algorithm | RSA-4096 |
| Hash | SHA-512 |
| Padding | PSS |
| Encoding | Base64 (the header value) |
| Signed content | The **raw request body** (exact bytes) |
| Secret | None — verify with Utila's PEM **public** key |

There are **no** `webhook-id` / `webhook-timestamp` headers — this is **not**
Standard Webhooks. There is no timestamp at all, so Utila offers no built-in replay
protection; dedupe on the event `id`.

## Implementation

There is no usable Utila SDK for verification (the documented `@utila/api` npm
package does not currently resolve on the public registry, and there is no Python
SDK), so verify manually with the platform crypto library.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyUtilaSignature(rawBody, signatureB64, publicKeyPem) {
  if (!signatureB64) return false;
  try {
    return crypto.verify(
      'sha512',
      rawBody, // Buffer of the exact request bytes
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_AUTO,
      },
      Buffer.from(signatureB64, 'base64')
    );
  } catch {
    return false;
  }
}
```

`RSA_PSS_SALTLEN_AUTO` lets Node auto-detect the PSS salt length during
verification, so you don't have to match Utila's exact salt length.

### Python (FastAPI)

```python
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature
import base64

def verify_utila_signature(raw_body: bytes, signature_b64: str, public_key_pem: bytes) -> bool:
    if not signature_b64:
        return False
    public_key = serialization.load_pem_public_key(public_key_pem)
    try:
        public_key.verify(
            base64.b64decode(signature_b64),
            raw_body,  # exact request bytes
            padding.PSS(mgf=padding.MGF1(hashes.SHA512()), salt_length=padding.PSS.AUTO),
            hashes.SHA512(),
        )
        return True
    except (InvalidSignature, ValueError):
        return False
```

`padding.PSS.AUTO` (cryptography ≥ 37) auto-detects the salt length on
verification, mirroring `RSA_PSS_SALTLEN_AUTO` in Node.

## Common Gotchas

- **Use the raw body.** Verify the exact bytes Utila sent. Any re-serialization of
  parsed JSON (key reordering, whitespace) breaks the signature. In Express use
  `express.raw()`; in Next.js use `await req.text()`; in FastAPI use
  `await request.body()`.
- **Public key, not a secret.** There is no HMAC secret to keep private — you hold
  only the public key. Verification never involves a shared secret.
- **Base64-decode the header** before passing it to the verifier.
- **Multi-line PEM in env vars.** If you store the key with escaped `\n`, convert
  them back to real newlines before loading (the examples do this).
- **No replay window.** With no timestamp header you cannot reject "old" requests
  by time. Dedupe on event `id` and make handlers idempotent.
- **Fail closed.** Any error (missing header, malformed key, bad base64) must
  return `false` / HTTP 400 — never accept an unverified payload.

## How to Debug Verification Failures

- **Always fails** → confirm you're verifying the *raw* body, not a re-stringified
  object, and that the PEM is a complete `-----BEGIN PUBLIC KEY-----` block with
  real newlines.
- **Works in tests, fails in prod** → your framework parsed the body before you
  captured it; capture raw bytes at the route boundary.
- **`ERR_OSSL` / decode errors** → the header wasn't base64-decoded, or the PEM is
  truncated / has literal `\n` characters.
- **Intermittent failures** → make sure you didn't trim or lowercase the header
  value; pass it through verbatim.
