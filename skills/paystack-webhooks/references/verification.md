# Paystack Signature Verification

## How It Works

Every Paystack webhook request includes an `x-paystack-signature` header. Its
value is an **HMAC-SHA512** digest, **hex**-encoded, computed over the **raw
request body** using your **secret key** as the HMAC key:

```
signature = hex( HMAC_SHA512(key = PAYSTACK_SECRET_KEY, message = raw_request_body) )
```

To verify, recompute the HMAC over the raw body you received and compare it to
the header value. This is **not** the Standard Webhooks scheme — there is a
single `x-paystack-signature` header, no `webhook-id`/`webhook-timestamp`
headers, and no timestamp is mixed into the signed content (so there is no
replay-window check to implement).

| Property | Value |
|----------|-------|
| Header | `x-paystack-signature` |
| Algorithm | HMAC-SHA512 |
| Encoding | Hex |
| Signed content | Raw request body (unmodified bytes) |
| Key | Your Paystack **secret key** (`sk_test_…` / `sk_live_…`) |

## No SDK Helper — Verify Manually

The official Paystack SDKs (`@paystack/paystack-sdk` on npm, `paystack-sdk` on
PyPI) are general-purpose API clients. They are minimally maintained and expose
**no webhook verification helper**, so verify manually in every framework using
your language's built-in HMAC library.

> Paystack's own documentation example hashes `JSON.stringify(req.body)`. In
> practice, hash the **raw request body bytes** instead — re-serializing parsed
> JSON can reorder keys or change whitespace and produce a mismatched HMAC. The
> examples in this skill all hash the raw body.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyPaystackWebhook(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody)          // Buffer/string of the raw body
    .digest('hex');
  try {
    // Compare the two hex strings in constant time.
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // length mismatch → invalid
  }
}
```

### Python (FastAPI)

```python
import hmac, hashlib

def verify_paystack_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,             # raw bytes, NOT parsed JSON
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

## Common Gotchas

- **Use the raw body, not parsed JSON.** Re-serializing (`JSON.stringify`) can
  reorder keys or change whitespace, producing a different HMAC and a false
  mismatch. Capture the raw bytes/string before any JSON parsing.
  - Express: `express.raw({ type: 'application/json' })`.
  - Next.js App Router: `await request.text()`.
  - FastAPI: `await request.body()`.
- **SHA-512, not SHA-256.** Many providers use HMAC-SHA256; Paystack uses
  **SHA-512**. A SHA-256 digest will always fail.
- **Secret key is the signing key.** The HMAC key is your `sk_…` secret key, not
  a separate webhook secret. It is the same key you use for API calls.
- **Hex, not base64.** Paystack encodes the signature as hex (128 characters for
  SHA-512).
- **Header casing.** HTTP headers are case-insensitive; frameworks lowercase
  them (`x-paystack-signature`). Read them case-insensitively.
- **Event type is in the body**, not a header. Dispatch on the JSON `event`
  field after verifying.
- **Test vs Live keys differ.** A signature computed with the wrong mode's secret
  key will fail — make sure the key matches the mode that sent the event.

## Debugging Verification Failures

1. **Fails on every request** — Confirm `PAYSTACK_SECRET_KEY` matches the secret
   key for the correct mode (Test vs Live), and that you are hashing with
   **SHA-512**.
2. **Works locally, fails in prod** — A proxy or body parser is likely mutating
   the body. Ensure the raw body reaches your verification untouched.
3. **Always fails despite correct key** — You are probably hashing parsed/
   re-stringified JSON (e.g. the docs' `JSON.stringify(req.body)`). Hash the exact
   raw bytes received instead.
4. **Digest length looks wrong** — A valid Paystack signature is 128 hex chars.
   A 64-char value means you used SHA-256 by mistake.
