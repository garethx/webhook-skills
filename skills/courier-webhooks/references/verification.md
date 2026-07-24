# How to Verify Courier Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL — anyone can POST to it. Verifying the
`courier-signature` header proves the request was signed with your webhook secret and
that the body was not tampered with in transit. Always verify before acting on a payload.

## How Courier Signs Webhooks

Courier signs every outbound webhook with **HMAC-SHA256**. There is **no Standard Webhooks**
implementation and **no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers** —
Courier uses a single custom header.

- **Header name:** `courier-signature`
- **Header format:** `t=<timestamp>,signature=<hex_digest>`
  - Example: `t=1631816343012,signature=33777cdae0468ff0939b3609d02d14e6e80ca093c2ea233455f0767055218875`
  - `t` is the epoch timestamp in **milliseconds**
  - `signature` is the lowercase **hex** HMAC-SHA256 digest
- **Signed content:** `` `${timestamp}.${rawBody}` `` — the timestamp, a literal `.`,
  then the exact raw request body
- **Key:** your webhook signing secret

## No Verification SDK

Courier's SDKs (`@trycourier/courier` for Node, `trycourier` for Python) are for
**sending** notifications and calling the API — they do **not** include a webhook
signature verifier. Verify manually with your language's standard crypto library.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyCourierWebhook(rawBody, signatureHeader, secret, toleranceMs = 5 * 60 * 1000) {
  if (!signatureHeader) return false;

  // Parse "t=<ms>,signature=<hex>"
  const parts = {};
  for (const segment of signatureHeader.split(',')) {
    const i = segment.indexOf('=');
    if (i !== -1) parts[segment.slice(0, i).trim()] = segment.slice(i + 1).trim();
  }
  const timestamp = parts.t;
  const signature = parts.signature;
  if (!timestamp || !signature) return false;

  // Reject stale deliveries (timestamp is epoch milliseconds)
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > toleranceMs) return false;

  // Recompute the HMAC over "<timestamp>.<rawBody>"
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // Constant-time compare
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false; // hex length mismatch = invalid
  }
}
```

### Python (FastAPI)

```python
import hmac
import hashlib
import time


def verify_courier_signature(
    raw_body: bytes,
    signature_header: str,
    secret: str,
    tolerance_ms: int = 5 * 60 * 1000,
) -> bool:
    if not signature_header:
        return False

    # Parse "t=<ms>,signature=<hex>"
    parts: dict[str, str] = {}
    for segment in signature_header.split(","):
        key, _, value = segment.partition("=")
        parts[key.strip()] = value.strip()

    timestamp = parts.get("t")
    signature = parts.get("signature")
    if not timestamp or not signature:
        return False

    # Reject stale deliveries (timestamp is epoch milliseconds)
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time() * 1000) - ts) > tolerance_ms:
        return False

    # Recompute the HMAC over "<timestamp>.<raw_body>"
    signed_payload = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()

    # Constant-time compare
    return hmac.compare_digest(expected, signature)
```

## Common Gotchas

- **Use the raw body.** Sign/verify against the exact bytes Courier sent. If you
  `JSON.parse` and re-serialize, key order or whitespace can differ and the HMAC won't
  match. In Express use `express.raw()`; in Next.js use `await request.text()`; in
  FastAPI use `await request.body()`.
- **Timestamp is in milliseconds.** The `t` value (e.g. `1631816343012`) is epoch
  **milliseconds**, not seconds. Compare against `Date.now()` / `time.time() * 1000`,
  not against a seconds-based clock.
- **Signature is hex, not base64.** Decode/compare as hexadecimal.
- **Header name is lowercase.** `courier-signature`. HTTP header lookups are
  case-insensitive in these frameworks, but match the documented casing.
- **Constant-time comparison.** Use `crypto.timingSafeEqual` / `hmac.compare_digest` to
  avoid timing attacks. `timingSafeEqual` throws on length mismatch — wrap it in
  try/catch and treat a throw as invalid.

## Debugging Verification Failures

- **Always fails / signature mismatch:** You're almost certainly verifying against a
  re-serialized body. Capture and hash the raw bytes exactly as received.
- **Fails only after a delay:** The timestamp tolerance rejected a replayed or slow
  delivery. Widen `toleranceMs` if your processing is legitimately slow, or check for
  clock skew between your server and Courier.
- **`Missing courier-signature` errors:** Confirm the request actually came from Courier
  (or your tunnel) and that no proxy stripped the header.
- **Wrong secret:** Each environment (test vs production) has its own signing secret.
  Make sure `COURIER_WEBHOOK_SECRET` matches the environment the webhook was created in.
