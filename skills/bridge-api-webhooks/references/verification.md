# Bridge API Signature Verification

## How It Works

Bridge signs each webhook so you can confirm it genuinely came from Bridge and
was not modified in transit.

- **Header:** `BridgeApi-Signature`
- **Algorithm:** HMAC-SHA256
- **Key:** the webhook's signing secret (`BRIDGE_WEBHOOK_SECRET`)
- **Message:** the **raw** request body, exactly as received (no JSON re-serialization)
- **Encoding:** hexadecimal, **UPPERCASE**
- **Format:** one or more scheme-prefixed values, comma-separated:

  ```
  BridgeApi-Signature: v1=E5637CDB...,v1=A1B2C3D4...
  ```

### Why multiple signatures?

Only the `v1` scheme is a valid live signature. During a **secret rotation** the
previous secret stays valid for 24 hours, so a webhook can have up to **2 active
secrets** and Bridge sends a `v1=` value for each. Accept the delivery if **any**
`v1` value matches your computed digest.

### Why ignore non-`v1` schemes?

If a future/legacy scheme prefix appears, ignore it. Only trust `v1`. Blindly
accepting any scheme would enable a **downgrade attack** where an attacker
presents a weaker scheme you didn't intend to honour.

## No Official SDK

Bridge does not publish a webhook-verification SDK, so verify manually with your
standard-library HMAC implementation.

## Implementation

### Node.js (manual)

```javascript
const crypto = require('crypto');

function verifyBridgeWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;

  // Compute HMAC-SHA256 of the RAW body, keyed on the signing secret
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Keep only v1= signatures (ignore other schemes → prevent downgrade)
  const signatures = signatureHeader.split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1='))
    .map((s) => s.slice(3));
  if (signatures.length === 0) return false;

  // hex decoding is case-insensitive, so Bridge's UPPERCASE hex compares fine.
  // timingSafeEqual throws on length mismatch → wrap in try/catch.
  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  });
}
```

### Python (manual)

```python
import hmac
import hashlib


def verify_bridge_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False

    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()

    signatures = [
        s.strip()[3:]
        for s in signature_header.split(",")
        if s.strip().startswith("v1=")
    ]
    if not signatures:
        return False

    # Bridge sends UPPERCASE hex; lowercase both sides for a clean constant-time compare
    return any(hmac.compare_digest(sig.lower(), expected.lower()) for sig in signatures)
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes received. If you parse
  JSON and re-serialize (or a framework auto-parses the body), whitespace and
  key ordering change and the signature will never match. In Express use
  `express.raw()`; in Next.js use `await request.text()`; in FastAPI use
  `await request.body()`.
- **Case-insensitive hex.** Bridge sends UPPERCASE hex. Decoding hex to bytes is
  case-insensitive (Node's `Buffer.from(x, 'hex')`), but if you compare strings
  directly, normalise case first (the Python example lowercases both sides).
- **Only trust `v1`.** Filter to `v1=` values before comparing. Ignore any other
  scheme to avoid downgrade attacks.
- **Accept any matching `v1`.** During a rotation there can be two signatures —
  succeed if either matches, or you'll drop valid deliveries for 24 hours.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`,
  not `==`. Wrap the Node comparison in try/catch — it throws on length mismatch.
- **Verify before parsing.** Verify the signature first, then `JSON.parse` the
  body. Never act on unverified data.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Signature never matches | Body was parsed/re-serialized before verifying — use the raw body |
| Works, then fails after a rotation | Only checking one signature — accept any matching `v1` value |
| Intermittent failures behind a proxy | Body mutated by middleware (compression, body-parser) before your handler |
| `timingSafeEqual` throws | Length mismatch — compare hex-decoded buffers and catch the error |
| All deliveries rejected | Wrong secret, or comparing the header verbatim without stripping `v1=` |
