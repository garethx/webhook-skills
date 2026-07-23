# Zendesk Signature Verification

## How It Works

Zendesk signs every webhook request with **HMAC-SHA256** and **base64**-encodes
the result. The signed message is the **timestamp concatenated directly with the
raw request body**, with **no separator**:

```
signature = base64( HMAC_SHA256( key = signing_secret, message = timestamp + body ) )
```

Two headers carry the pieces you need:

| Header | Contents |
|--------|----------|
| `X-Zendesk-Webhook-Signature` | The base64 HMAC-SHA256 signature to compare against |
| `X-Zendesk-Webhook-Signature-Timestamp` | The timestamp that is prepended to the body before signing |

To verify: read both headers, recompute the HMAC over `timestamp + rawBody`
using your signing secret, base64-encode it, and compare it to the header value
with a timing-safe comparison.

> Zendesk does **not** follow the Standard Webhooks spec (`webhook-id` /
> `webhook-timestamp` / `webhook-signature`), and there is **no official SDK**
> for verification — the docs show inline crypto examples. Verify manually.

## Implementation

There is no Zendesk verification SDK, so all frameworks use manual verification
with the platform's crypto primitives.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyZendeskWebhook(rawBody, signature, timestamp, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp);   // timestamp first...
  hmac.update(rawBody);     // ...then the raw body (Buffer/string), no separator
  const expected = hmac.digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;           // length mismatch = invalid
  }
}
```

### Python (FastAPI)

```python
import hmac, hashlib, base64

def verify_zendesk_webhook(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    message = timestamp.encode("utf-8") + raw_body  # timestamp + raw body, no separator
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(expected, signature)
```

## Common Gotchas

- **Use the raw body.** Compute the HMAC over the exact bytes Zendesk sent. If a
  framework parses JSON first and you re-serialize, whitespace/key-order changes
  break the signature. Read the raw body before any JSON middleware.
- **Concatenate timestamp + body directly.** There is **no** `.` or other
  separator between the timestamp and the body (unlike Stripe's `timestamp.body`).
- **Prepend the timestamp, don't append.** Message order is `timestamp` then `body`.
- **Handle empty bodies.** Some webhook requests (e.g. `GET`/`DELETE` methods)
  have no body. Signing an empty body is valid — treat a missing body as `""`.
- **Signature is base64, not hex.** Compare against a base64 string.
- **Missing headers ⇒ reject.** If either the signature or timestamp header is
  absent, return `400` before doing any work.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`
  and guard against length-mismatch exceptions.

## Test Secret

Test requests sent from the webhook builder (before the webhook exists) are
signed with the static secret:

```
dGhpc19zZWNyZXRfaXNfZm9yX3Rlc3Rpbmdfb25seQ==
```

The example test suites use this value so generated signatures match what Zendesk
produces for test deliveries.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Every request fails verification | Body was parsed/re-serialized before hashing — use the raw body |
| Works for test, fails for real (or vice versa) | Using the static test secret when you need the webhook's real signing secret, or vice versa |
| Intermittent failures | Timestamp not prepended, or a separator accidentally inserted between timestamp and body |
| `timingSafeEqual` throws | Signatures differ in length — wrap in try/catch and return `false` |
| Signature never matches | Comparing hex instead of base64, or using the wrong HMAC key |
