# How to Verify Bridge (bridge.xyz) Webhook Signatures

## Why Signature Verification Matters

Bridge webhooks trigger money movement and KYC state changes in your system. An
attacker who could forge a webhook could fake a settled transfer or an approved
customer. Verifying the RSA signature proves the request genuinely came from
Bridge and wasn't tampered with in transit.

## How It Works

Bridge signs each event with **RSA-SHA256** using a private key it holds. You
verify with the matching **public key**, which is returned **per endpoint** in the
`public_key` field of the webhook create/update/enable API response (PEM format).
There is **no HMAC shared secret** and **no official SDK** — you verify manually.

### The Signature Header

```
X-Webhook-Signature: t=<timestamp_ms>,v0=<base64_signature>
```

- `t` — the timestamp in **milliseconds** since epoch.
- `v0` — the RSA signature, **base64-encoded** (may contain `=` padding).

### Verification Steps

1. Parse the header into `t` and `v0`. Split each pair on the **first** `=` only —
   the base64 signature can contain `=` padding.
2. Reject the event if `t` is older than ~10 minutes (replay protection).
3. Build the signed string `"<timestamp>.<rawBody>"` using the **raw** request body.
4. Compute `digest = SHA256(signed string)`.
5. Base64-decode `v0`.
6. RSA-SHA256-verify the decoded signature against `digest` using the endpoint's public key.

### The Double-Hash Quirk (important)

Bridge's reference implementation feeds the **already-computed SHA256 digest**
into an RSA-SHA256 verifier. An RSA-SHA256 verify hashes its input with SHA256 as
part of the operation — so `digest` is effectively hashed **again**. In other
words the message signed is `SHA256(digest)` where `digest = SHA256("t.body")`.

You do **not** implement this twice manually — you just pass the `digest` (not the
raw `"t.body"` string) as the message to a standard RSA-SHA256 verify, and the
second hash happens inside the verifier. The code below does exactly that. Getting
this wrong (passing the raw string instead of the digest) is the #1 cause of
verification failures against Bridge.

## Implementation

There is no Bridge SDK for webhook verification, so all frameworks verify manually
with the language's standard crypto library.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyBridgeSignature(rawBody, header, publicKeyPem, toleranceMs = 10 * 60 * 1000) {
  if (!header) return false;

  // Parse "t=<ms>,v0=<base64>" — split on the FIRST '=' (base64 padding is '=')
  const parts = {};
  for (const p of header.split(',')) {
    const i = p.indexOf('=');
    if (i === -1) continue;
    parts[p.slice(0, i)] = p.slice(i + 1);
  }
  const { t: timestamp, v0: signature } = parts;
  if (!timestamp || !signature) return false;

  // Replay protection: reject events older than the tolerance window
  if (Date.now() - Number(timestamp) > toleranceMs) return false;

  // SHA256 digest of "<timestamp>.<rawBody>"; RSA-SHA256 verify hashes it AGAIN
  const digest = crypto.createHash('sha256').update(`${timestamp}.${rawBody}`).digest();
  const verifier = crypto.createVerify('sha256');
  verifier.update(digest);
  verifier.end();

  try {
    return verifier.verify(publicKeyPem, signature, 'base64');
  } catch {
    return false; // malformed key/signature
  }
}
```

### Python (FastAPI)

```python
import base64
import hashlib
import time
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature


def verify_bridge_signature(raw_body: bytes, header: str, public_key_pem: str,
                            tolerance_ms: int = 10 * 60 * 1000) -> bool:
    if not header:
        return False

    # Parse "t=<ms>,v0=<base64>" — split on the FIRST '=' (base64 padding is '=')
    parts = {}
    for pair in header.split(","):
        key, sep, value = pair.partition("=")
        if sep:
            parts[key] = value
    timestamp = parts.get("t")
    signature_b64 = parts.get("v0")
    if not timestamp or not signature_b64:
        return False

    # Replay protection: reject events older than the tolerance window
    if int(time.time() * 1000) - int(timestamp) > tolerance_ms:
        return False

    signature = base64.b64decode(signature_b64)

    # SHA256 digest of "<timestamp>.<raw_body>"; verify() hashes it AGAIN with SHA256
    digest = hashlib.sha256(f"{timestamp}.".encode() + raw_body).digest()

    public_key = serialization.load_pem_public_key(public_key_pem.encode())
    try:
        public_key.verify(signature, digest, padding.PKCS1v15(), hashes.SHA256())
        return True
    except (InvalidSignature, ValueError):
        return False
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes Bridge sent. Re-serializing
  parsed JSON reorders/reformats keys and breaks the signature.
- **Pass the digest, not the raw string, to the verifier.** The RSA-SHA256 verify
  hashes its input a second time — feeding it the digest is the documented behavior.
- **Split the header on the first `=` only.** The base64 `v0` value can contain `=`
  padding; a naive `split('=')` corrupts the signature.
- **Timestamp is in milliseconds.** Compare against `Date.now()` (JS) /
  `time.time() * 1000` (Python), not seconds.
- **The public key is per-endpoint.** Use the `public_key` returned for the
  specific webhook you registered — there is no single global key.
- **PEM formatting.** If you store the key as a single line with `\n` escapes,
  convert `\n` back to real newlines before loading (the examples do this).
- **Return 400 on failure.** Bridge retries on non-2xx; a 400 signals "retry".

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails, valid-looking signature | Passing `"t.body"` string instead of the SHA256 digest to `verify` (missing the double hash) |
| Fails only for some payloads | Body was parsed/re-serialized; verify the **raw** body |
| Signature parse errors | Header split on every `=` instead of the first; base64 padding lost |
| Intermittent failures near delivery | Timestamp compared in seconds vs milliseconds, tripping the tolerance check |
| `load_pem_public_key` / `verify` throws | Env var still has literal `\n`; convert to real newlines |
