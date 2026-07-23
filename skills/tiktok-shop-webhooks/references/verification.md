# TikTok Shop Signature Verification

## How It Works

TikTok Shop signs every webhook and delivers the signature in the HTTP
**`Authorization`** header (the raw value, **no `Bearer` prefix**). The signature
is a **lowercase-hex HMAC-SHA256**:

```
signature = HMAC_SHA256(key = app_secret, message = app_key + raw_request_body)
```

- **Algorithm:** HMAC-SHA256
- **Encoding:** lowercase hexadecimal
- **Key:** your app's `app_secret`
- **Signed content:** `app_key` **concatenated with** the **raw request body**
  (the exact bytes received, before any JSON parsing)
- **Header:** `Authorization`

> **Important distinctions**
> - This is **not** the [Standard Webhooks](https://www.standardwebhooks.com/)
>   spec — there are no `webhook-id` / `webhook-timestamp` / `webhook-signature`
>   headers.
> - It is **different** from TikTok Shop's **API request** signing (which signs
>   the path + sorted query + body and passes a `sign` query parameter). Do not
>   reuse that logic here.
> - There is **no timestamp inside the signature**, so it provides **no replay
>   protection**. Rely on `tts_notification_id` for idempotency instead.

There is no official TikTok Shop SDK helper for webhook signature verification,
so verify manually in every framework.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyTikTokShop(rawBody, authHeader, appKey, appSecret) {
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(appKey + rawBody)          // rawBody: raw bytes as UTF-8, NOT parsed JSON
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(authHeader || '', 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false;                      // length mismatch = invalid
  }
}
```

### Python (FastAPI)

```python
import hmac
import hashlib

def verify_tiktok_shop(raw_body: bytes, auth_header: str, app_key: str, app_secret: str) -> bool:
    message = app_key.encode("utf-8") + raw_body      # raw bytes, NOT parsed JSON
    expected = hmac.new(
        app_secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, auth_header or "")
```

## Common Gotchas

- **Use the raw body.** Re-serializing parsed JSON changes whitespace and key
  order and breaks the HMAC. In Express use `express.raw()`; in Next.js use
  `await request.text()`; in FastAPI use `await request.body()`.
- **`app_key` prefixes the body.** The signed message is `app_key + rawBody`, not
  the body alone. Forgetting the prefix is the most common failure.
- **No `Bearer` prefix.** The `Authorization` header value *is* the hex
  signature. Do not strip a scheme or split on a space.
- **Lowercase hex.** Compare hex to hex; don't base64-decode.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`.
  Guard against length mismatches (they throw in Node).
- **Return 401, not 400, for a bad signature.** TikTok Shop treats `401` as a
  rejected signature. Return `200` with an empty body on success.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails | Signing body only — must sign `app_key + rawBody` |
| Fails intermittently after middleware | Body was parsed/re-serialized; capture the raw body |
| Fails with `TypeError` in Node | `timingSafeEqual` on unequal lengths — wrap in try/catch |
| Works locally, fails in prod | A proxy rewrote the body or the `Authorization` header |
| Signature looks right but rejected | Wrong `app_secret`, or comparing hex against base64 |
