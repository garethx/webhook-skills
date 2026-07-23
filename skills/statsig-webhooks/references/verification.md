# Statsig Signature Verification

## How It Works

Statsig signs every Event Webhook request with **HMAC-SHA256** using your
integration's **signing secret**. This is the same Slack/Stripe-style scheme —
**not** the Standard Webhooks spec. The signature arrives in two headers:

| Header | Value |
|--------|-------|
| `X-Statsig-Request-Timestamp` | Unix epoch in **milliseconds**, e.g. `1671672194836` |
| `X-Statsig-Signature` | `v0=<hex>` — the version prefix is part of the value |

The string that gets signed is the literal concatenation:

```
v0:{timestamp}:{raw_body}
```

The version (`v0`), the timestamp from the `X-Statsig-Request-Timestamp` header,
and the **raw request body** are joined with literal colons. The output is then
hex-encoded and prefixed with `v0=` for comparison against `X-Statsig-Signature`.

The official documentation gives this pseudo-code:

```
statsig_signature = 'v0=' + hmac.compute_hash_sha256(
  webhook_signing_secret,
  signature_basestring
).hexdigest()
```

There is **no official webhook-verification SDK** — implement the HMAC directly
as shown below.

## Verification Steps

1. Read `X-Statsig-Signature` and `X-Statsig-Request-Timestamp`. Reject if either is missing.
2. (Best practice) Reject if the timestamp differs from local time by more than
   **5 minutes** for replay protection. Statsig does not document a tolerance,
   so this is an optional hardening step.
3. Build the basestring `v0:{timestamp}:{raw_body}` using the **raw** request
   body — do not parse JSON first.
4. Compute `v0=` + HMAC-SHA256(signing_secret, basestring).hex().
5. Compare to `X-Statsig-Signature` with a **timing-safe** comparison.

> **The timestamp is in milliseconds.** `X-Statsig-Request-Timestamp` is a
> 13-digit millisecond epoch. Compare it against `Date.now()` (JS) or
> `time.time() * 1000` (Python) — not against seconds.

## Implementation

### Node.js / Express / Next.js

```javascript
const crypto = require('crypto');

function verifyStatsigRequest(rawBody, signatureHeader, timestampHeader, signingSecret) {
  if (!signatureHeader || !timestampHeader || !signingSecret) return false;

  // Statsig's timestamp is a Unix time in MILLISECONDS (13 digits)
  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;

  const basestring = `v0:${timestampHeader}:${rawBody}`;
  const expected = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(basestring, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
```

### Python / FastAPI

```python
import hmac
import hashlib
import time

def verify_statsig_request(raw_body: bytes, signature_header: str, timestamp_header: str, signing_secret: str) -> bool:
    if not signature_header or not timestamp_header or not signing_secret:
        return False

    try:
        timestamp = int(timestamp_header)
    except ValueError:
        return False

    # Statsig's timestamp is in MILLISECONDS
    if abs(time.time() * 1000 - timestamp) > 5 * 60 * 1000:
        return False

    basestring = f"v0:{timestamp_header}:{raw_body.decode('utf-8')}".encode("utf-8")
    expected = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        basestring,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature_header)
```

## Common Gotchas

- **Use the raw body.** If you let Express or FastAPI parse JSON first and then
  re-stringify it, whitespace and key ordering will differ from what Statsig
  signed, and the signature will not match. Always feed the original `Buffer` /
  `bytes` into HMAC.
- **The timestamp is in milliseconds, not seconds.** A 13-digit value. If you
  treat it as seconds in your replay check, every request will look thousands of
  years in the future and get rejected.
- **The signature header includes the `v0=` prefix.** Compare the full string
  `v0=<hex>` — don't strip the prefix on only one side.
- **The timestamp is part of the signed string.** Statsig uses the value from
  `X-Statsig-Request-Timestamp`, not the current time. Don't substitute
  `Date.now()` when building the basestring.
- **Use a timing-safe comparison** (`crypto.timingSafeEqual` /
  `hmac.compare_digest`). A normal `===` leaks information through timing.
- **No official verification SDK.** Statsig only publishes HMAC pseudo-code;
  implement verification yourself with the snippets above.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| All signatures fail, including from real Statsig | Body is being parsed/re-stringified before signing. Use the raw `Buffer`/`bytes`. |
| Every request rejected as stale/future | Timestamp treated as seconds instead of milliseconds in the replay check. |
| Off-by-one mismatch | Forgot the `v0=` prefix on the computed signature. |
| Tests fail with "Cannot read property of undefined" | Header lookup is case-sensitive in your framework. Statsig sends lowercase over HTTP/2. |
| Works in dev, fails in production | Production uses a different signing secret. Each integration has its own. |
