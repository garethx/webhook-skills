# Tally Signature Verification

## How It Works

Tally webhooks use an **optional** signing secret. When you configure a signing secret on the
form's webhook (Integrations tab), Tally signs every request and includes the signature in a
header:

- **Header:** `Tally-Signature` (HTTP headers are case-insensitive; frameworks often lowercase it
  to `tally-signature`)
- **Algorithm:** HMAC-SHA256
- **Key:** your signing secret
- **Signed content:** the **raw JSON request body**
- **Encoding:** Base64

So the expected signature is:

```
base64(HMAC-SHA256(signingSecret, rawJsonBody))
```

There is **no timestamp** and **no message-id** in the signed content, and this is **not** the
Standard Webhooks specification (no `webhook-id` / `webhook-timestamp` / `webhook-signature`
headers).

## Why Raw Body Matters

Tally's own examples compute the signature over `JSON.stringify(payload)`. The bytes Tally sends
over the wire **are** that JSON string, so hashing the **raw request body** you received is the
correct and robust approach. If you parse the JSON and re-serialize it yourself, key ordering,
whitespace, or number/unicode formatting can differ from Tally's serialization and the signature
will not match. **Always capture and HMAC the raw body**, before any JSON parsing.

## Implementation

There is no official Tally SDK, so verify manually. The same algorithm works in every language.

### Node.js

```javascript
const crypto = require('crypto');

function verifyTallyWebhook(rawBody, signatureHeader, signingSecret) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(rawBody) // rawBody: Buffer (Express) or string (Next.js)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // different lengths = invalid
  }
}
```

### Python

```python
import hmac, hashlib, base64

def verify_tally_webhook(raw_body: bytes, signature_header: str, signing_secret: str) -> bool:
    if not signature_header:
        return False
    expected = base64.b64encode(
        hmac.new(signing_secret.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(signature_header, expected)
```

## Handling the Optional Secret

Because signing is optional, decide up front how your handler behaves:

- **Signing secret configured (recommended for production):** require the `Tally-Signature`
  header, verify it, and return `400` if it is missing or invalid.
- **No signing secret configured:** requests arrive unsigned. You cannot verify them; process at
  your own risk (ideally only in development). Log a clear warning so an unsigned production
  endpoint is obvious.

The example handlers implement exactly this: verify when `TALLY_SIGNING_SECRET` is set, otherwise
warn and process.

## Common Gotchas

- **Use the raw body, not re-stringified JSON.** Re-serializing the parsed payload can change
  bytes and break verification. Capture the raw body before parsing.
- **Base64, not hex.** Tally encodes the digest with Base64. Comparing against a hex digest always
  fails.
- **Header casing.** Read the header case-insensitively (`tally-signature` in most frameworks).
- **Optional secret.** If no secret is set, there is no `Tally-Signature` header at all — don't
  treat a missing header as a server error when you intentionally run unsigned.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`; wrap in try/catch
  because comparing buffers of different lengths throws.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Valid-looking requests always return 400 | You hashed parsed/re-serialized JSON instead of the raw body |
| Signature never matches | Comparing hex vs base64, or wrong signing secret |
| Works locally, fails behind a proxy | A middleware parsed/rewrote the body before you captured it |
| No `Tally-Signature` header present | No signing secret is configured on the Tally webhook |
