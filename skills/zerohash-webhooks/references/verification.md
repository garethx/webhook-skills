# How to Verify Zero Hash Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is public. Without verification, anyone could POST a fake
`trade_status_changed` event claiming a trade settled, or a fake
`account_balance.changed` event, and trick your app into acting on funds that
never moved. Zero Hash signs every webhook so you can prove it is authentic
before acting on it.

## How It Works

Zero Hash offers two schemes. Both are HMAC-SHA256 (an RSA-SHA256 variant is
also available). All signatures are **hex**-encoded.

### Recommended scheme (replay-protected)

- **Signature header:** `x-zh-hook-signature`
- **Timestamp header:** `x-zh-hook-timestamp` (UNIX timestamp in **milliseconds**)
- **Algorithm:** HMAC-SHA256
- **Encoding:** hexadecimal
- **Signed content:** `payload + timestamp` — the raw request body string
  concatenated with the timestamp string, **with no delimiter**
- **Key:** your HMAC shared secret (provisioned by your Zero Hash rep)
- **Replay guard:** reject if `x-zh-hook-timestamp` is not within **±5 minutes**
  of your system clock

```
x-zh-hook-signature = to_hex(hmac_sha256(payload + timestamp, your-secret))
```

### Legacy scheme (no timestamp)

- **Signature header:** `x-zh-hook-signature-256`
- **Signed content:** `payload` only (the raw request body)

```
x-zh-hook-signature-256 = to_hex(hmac_sha256(payload, your-secret))
```

### RSA variants

Zero Hash can also sign with RSA-SHA256, delivered in `x-zh-hook-rsa-signature`
(over `payload + timestamp`) or `x-zh-hook-rsa-signature-256` (over `payload`).
Verify these with the **Zero Hash public key** (`zh-public-key`) your rep
provides — this is a dedicated webhook key, **not** the public key of a REST API
key. Use RSA when your security policy prefers asymmetric verification.

## Implementation

There is **no Zero Hash webhook SDK** — verify manually. Always verify the
**raw request body** exactly as received; never re-serialize parsed JSON.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyZeroHash(rawBody, signature, timestamp, secret, toleranceMs = 5 * 60 * 1000) {
  if (!signature || !timestamp) return false;
  // Replay guard: x-zh-hook-timestamp is UNIX milliseconds.
  if (Math.abs(Date.now() - Number(timestamp)) > toleranceMs) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody + timestamp, 'utf8') // payload + timestamp, no delimiter
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false; // length mismatch => invalid
  }
}
```

### Python (FastAPI)

```python
import hashlib
import hmac
import time


def verify_zerohash(raw_body: bytes, signature: str, timestamp: str,
                    secret: str, tolerance_ms: int = 5 * 60 * 1000) -> bool:
    if not signature or not timestamp:
        return False
    # Replay guard: x-zh-hook-timestamp is UNIX milliseconds.
    if abs(int(time.time() * 1000) - int(timestamp)) > tolerance_ms:
        return False
    signed = raw_body + timestamp.encode("utf-8")  # payload + timestamp, no delimiter
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

### Legacy verification (no timestamp)

If you receive only `x-zh-hook-signature-256`, sign the raw body alone:

```javascript
const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes received. In Express use
  `express.raw()`; in Next.js use `await request.text()`; in FastAPI use
  `await request.body()`. Parsing and re-serializing JSON changes whitespace and
  key order, so the signature will never match.
- **Concatenate with no delimiter.** The recommended scheme signs
  `payload + timestamp` directly — there is no `.` separator (unlike Stripe).
- **Timestamp is in milliseconds.** `x-zh-hook-timestamp` is UNIX **ms**, not
  seconds. Compare against `Date.now()` / `time.time() * 1000`.
- **hex, not base64.** Zero Hash uses `to_hex(...)`. Don't base64-decode.
- **This is not the REST API scheme.** Webhook signing does **not** use the
  `X-SCX-*` headers or `timestamp + method + path + body` base64 format. That is
  REST API auth, a different mechanism.
- **The event type is in a header.** Dispatch on `x-zh-hook-payload-type`, not on
  a `type` field in the body.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`,
  never `==`.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always fails / signature never matches | Body was parsed/re-serialized before verifying — use the raw body |
| Signature matches but request rejected | Timestamp outside ±5 min — check clock skew and that you read ms not seconds |
| Works with old integration, fails now | You're on the legacy header (`x-zh-hook-signature-256`, no timestamp) but signing `payload + timestamp` — match the header you received |
| `TypeError` / length error on compare | Signature header missing (`undefined`) — check the header exists first |
| Tried to reuse API auth code | Webhook signing differs from `X-SCX-*` REST auth — use the webhook scheme |
