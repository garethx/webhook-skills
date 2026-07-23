# Airtable Signature Verification

## How It Works

Airtable signs the **raw notification body** with HMAC-SHA256. The key is the
`macSecretBase64` value returned when the webhook was created — but you must
**base64-decode it first** and use the resulting bytes as the HMAC key. The digest is
**hex-encoded** and sent in the `X-Airtable-Content-MAC` header, prefixed with the
literal string `hmac-sha256=`.

```
X-Airtable-Content-MAC: hmac-sha256=<hex(HMAC_SHA256(base64decode(macSecretBase64), rawBody))>
```

Airtable does **not** use the Standard Webhooks spec (no `webhook-id` /
`webhook-timestamp` / `webhook-signature` headers).

## Implementation

There is no official Airtable Node SDK method for webhook verification (the `airtable`
npm package covers records only), so verify manually. The community Python package
`pyairtable` offers `WebhookNotification.from_request(body, header)` /
signature validation helpers, but manual verification is shown below so it works
without extra dependencies.

### Node (manual)

```javascript
const crypto = require('crypto');

function verifyAirtableSignature(rawBody, macHeader, macSecretBase64) {
  if (!macHeader) return false;
  const key = Buffer.from(macSecretBase64, 'base64');   // decode the secret first
  const expected =
    'hmac-sha256=' + crypto.createHmac('sha256', key).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(macHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths → not equal
  }
}
```

`rawBody` must be a `Buffer` (Express: `express.raw()`) or the exact string Airtable
sent — never a re-serialized JSON object.

### Python (manual)

```python
import hmac, hashlib, base64

def verify_airtable_signature(raw_body: bytes, mac_header: str, mac_secret_base64: str) -> bool:
    if not mac_header:
        return False
    key = base64.b64decode(mac_secret_base64)
    expected = "hmac-sha256=" + hmac.new(key, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac_header, expected)
```

## Common Gotchas

- **Decode the secret.** The most common mistake is using `macSecretBase64` directly as
  the HMAC key. It must be `base64`-decoded to raw bytes first.
- **Include the prefix.** The header value is `hmac-sha256=` + hex digest. Compare the
  full string, or strip the prefix on both sides — but be consistent.
- **Hex, not base64.** The digest is hex-encoded (Shopify uses base64; Airtable does not).
- **Raw body only.** Verify the exact bytes received. Any framework that parses JSON and
  re-stringifies will change whitespace/key order and break the MAC.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`, and guard
  against length-mismatch exceptions.
- **Respond fast and empty.** Return 200/204 with an **empty body within 25 seconds**.
  Verification and acknowledgement are cheap; fetch payloads afterward, asynchronously.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Using `macSecretBase64` without base64-decoding it |
| Always invalid | Comparing hex digest without the `hmac-sha256=` prefix |
| Intermittently invalid | Body was parsed/re-serialized before hashing |
| Invalid after redeploy | Secret lost (returned once); recreate the webhook to get a new one |
| `timingSafeEqual` throws | Buffers differ in length — wrap in try/catch and return false |

## References

- [Webhook notification delivery](https://airtable.com/developers/web/api/webhooks-overview#webhook-notification-delivery)
- [Create a webhook](https://airtable.com/developers/web/api/create-a-webhook)
