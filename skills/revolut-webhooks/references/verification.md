# How to Verify Revolut Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Anyone who discovers it can send it fake
requests. Signature verification proves that a request was created by Revolut
using your webhook's signing secret — and that the body was not modified in
transit. **Always verify before acting on a webhook.**

## How It Works

Revolut does **not** follow the Standard Webhooks spec. It uses its own `v1`
scheme:

- **Algorithm:** HMAC-SHA256
- **Encoding:** hexadecimal (lowercase)
- **Signing secret:** the webhook's `signing_secret`, prefix `wsk_`
- **Headers:**
  - `Revolut-Signature` — one or more signatures, each `v1=<hex>`, comma-separated
  - `Revolut-Request-Timestamp` — a UNIX timestamp (Revolut's examples show it
    in **milliseconds**, e.g. `1683650202360`)
- **Signed payload:** the three parts joined with periods:

  ```
  v1.{Revolut-Request-Timestamp}.{raw request body}
  ```

To verify, recompute the HMAC over that string and compare it (constant-time)
against the value(s) in `Revolut-Signature`.

## Implementation

There is **no official Revolut SDK** with a webhook-verification helper
(`@revolut/checkout` is a frontend widget only), so verify manually in every
language.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyRevolutSignature(rawBody, timestamp, signatureHeader, secret) {
  if (!timestamp || !signatureHeader) return false;

  // Reject stale timestamps (± 5 min). Header is a UNIX timestamp in ms.
  const ts = Number(timestamp);
  const tsMs = timestamp.length <= 10 ? ts * 1000 : ts; // tolerate seconds or ms
  if (!Number.isFinite(ts) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) return false;

  const expected = 'v1=' + crypto
    .createHmac('sha256', secret)
    .update(`v1.${timestamp}.${rawBody}`)
    .digest('hex');

  // Header may hold multiple signatures during rotation — accept any match.
  return signatureHeader.split(',').some((sig) => {
    const a = Buffer.from(sig.trim());
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

### Python (FastAPI)

```python
import hmac
import hashlib
import time


def verify_revolut_signature(raw_body: bytes, timestamp: str, signature_header: str, secret: str) -> bool:
    if not timestamp or not signature_header:
        return False

    # Reject stale timestamps (± 5 min). Header is a UNIX timestamp in ms.
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    ts_ms = ts * 1000 if len(timestamp) <= 10 else ts  # tolerate seconds or ms
    if abs(time.time() * 1000 - ts_ms) > 5 * 60 * 1000:
        return False

    signed_payload = f"v1.{timestamp}.".encode() + raw_body
    expected = "v1=" + hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()

    # Header may hold multiple signatures during rotation — accept any match.
    return any(
        hmac.compare_digest(sig.strip(), expected)
        for sig in signature_header.split(",")
    )
```

## Common Gotchas

- **Use the raw body.** Compute the HMAC over the exact bytes Revolut sent. If
  you `JSON.parse` and re-serialize, key order and whitespace change and the
  signature will never match. In Express use `express.raw()`; in Next.js use
  `await request.text()`; in FastAPI use `await request.body()`.
- **Prefix matters.** The signed string starts with the literal `v1.` and the
  header values start with `v1=`. Include them exactly.
- **Milliseconds vs seconds.** Revolut's docs call the header a "UNIX timestamp"
  but the example value is in milliseconds. Sign with the header string
  verbatim; only normalise when checking the ± 5-minute tolerance.
- **Multiple signatures.** During secret rotation `Revolut-Signature` can list
  several comma-separated signatures. Accept the request if **any** one matches.
- **Header case.** HTTP headers are case-insensitive; frameworks usually expose
  them lower-cased (`revolut-signature`, `revolut-request-timestamp`).
- **Constant-time compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`
  rather than `===` to avoid timing attacks. Guard against length mismatches so
  the comparison does not throw.

## Debugging Verification Failures

- **Always fails:** You are almost certainly verifying against a parsed/
  re-serialized body. Capture and hash the raw bytes instead.
- **Worked, then broke after a rotation:** Update `REVOLUT_SIGNING_SECRET`, or
  make sure you accept any of the comma-separated signatures during the overlap.
- **Wrong environment:** A sandbox signing secret cannot verify production
  traffic (and vice versa). Confirm the secret matches the host.
- **Stale-timestamp rejections:** Check your server clock (NTP). The tolerance is
  5 minutes against UTC.
