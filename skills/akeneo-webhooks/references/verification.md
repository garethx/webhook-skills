# Akeneo Signature Verification

## How It Works

Akeneo signs every webhook request with **HMAC-SHA256** using your connection
**secret**. Two headers are sent:

| Header | Value |
|--------|-------|
| `x-akeneo-request-signature` | Hex-encoded HMAC-SHA256 of the signed content |
| `x-akeneo-request-timestamp` | Unix timestamp (seconds) when the request was sent |

The **signed content** is the timestamp and the raw request body joined by a dot:

```
signedContent = timestamp + "." + rawBody
signature     = HMAC_SHA256(secret, signedContent)   // hex-encoded
```

Verify by recomputing the HMAC over the **raw** body (never the parsed JSON) and
comparing it to `x-akeneo-request-signature` with a timing-safe comparison. Reject
requests whose timestamp is too old to defend against replay attacks — a 5-minute
(`300s`) window is a common choice.

There is **no official Akeneo SDK**, so verification is manual in every framework.

## Implementation

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyAkeneoWebhook(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp) return false;

  // Replay protection: reject stale requests (5-minute window)
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody) // Buffer (Express) or string (Next.js) of the RAW body
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // different lengths / non-hex = invalid
  }
}
```

### Python (FastAPI)

```python
import hmac, hashlib, time

def verify_akeneo_webhook(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if not signature or not timestamp:
        return False

    # Replay protection: reject stale requests (5-minute window)
    try:
        age = int(time.time()) - int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(age) > 300:
        return False

    signed_content = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

- **Use the raw body.** Any re-serialization (parsing then re-stringifying JSON)
  changes the bytes and breaks the signature. In Express use
  `express.raw({ type: 'application/json' })`; in Next.js use `await request.text()`;
  in FastAPI use `await request.body()`.
- **Include the timestamp in the signed content.** The HMAC is over
  `timestamp + "." + body`, not the body alone.
- **Hex, not base64.** The signature is hex-encoded. Decode as hex when using
  `timingSafeEqual`.
- **Header names are lowercase.** Most frameworks normalize headers to lowercase;
  read `x-akeneo-request-signature` and `x-akeneo-request-timestamp`.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`,
  never `==`.
- **The secret is the connection secret.** It's the same `secret` shown in the
  connection settings, not the client ID or an API token.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Signature never matches | Body was parsed/re-serialized before hashing — use the raw body |
| Signature never matches | Timestamp not prepended, or joined without the `.` separator |
| `timingSafeEqual` throws | Comparing buffers of different lengths — wrap in try/catch and decode as hex |
| Always rejected as stale | Server clock skew, or comparing milliseconds vs seconds — Akeneo sends **seconds** |
| Works in tests, fails in prod | Reading the wrong header case, or a proxy stripped the signature headers |
