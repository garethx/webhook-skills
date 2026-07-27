# How to Verify Favro Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is public. Without verifying the signature, anyone who
learns the URL could POST fake card/comment events. Favro signs every delivery
with a secret only you and Favro know, so verifying the `X-Favro-Webhook` header
proves the request is authentic.

## How Favro's Signature Scheme Works

Favro does **not** use [Standard Webhooks](https://www.standardwebhooks.com/).
From the [Favro developer docs](https://favro.com/developer/#webhook-signatures):

> The header is a base64 digest of an HMAC-SHA1 hash. The hashed content is the
> concatenation of the `payloadId` and the URL exactly as it was provided during
> webhook creation. The key used to sign this text is the secret you entered when
> setting up the webhook.

| Property | Value |
|----------|-------|
| Header name | `X-Favro-Webhook` |
| Algorithm | HMAC-**SHA1** (not SHA256) |
| Encoding | base64 |
| Signed message | `payloadId + webhookUrl` — **not** the request body |
| Key | the `secret` you set when creating the webhook |

```
X-Favro-Webhook = base64( HMAC-SHA1( key = secret, message = payloadId + webhookUrl ) )
```

- `payloadId` is the top-level string in the JSON body.
- `webhookUrl` is the `postToUrl` you registered, verbatim.

> **Do not confuse `X-Favro-Webhook` with `X-Favro-Backend-Identifier`.** The
> latter is an unrelated internal header and is **not** the signature.

## Implementation

There is no official Favro SDK, so verification is manual in every language. The
community Node package [`@bscotch/bravo`](https://github.com/bscotch/bravo)
implements this same scheme.

### Node.js (manual)

```javascript
const crypto = require('crypto');

function verifyFavroWebhook(payloadId, webhookUrl, secret, signature) {
  if (!payloadId || !webhookUrl || !secret || !signature) return false;
  const expected = crypto
    .createHmac('sha1', secret)
    .update(payloadId + webhookUrl, 'utf8')
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false; // different lengths => invalid
  }
}
```

### Python (manual)

```python
import base64
import hashlib
import hmac

def verify_favro_webhook(payload_id: str, webhook_url: str, secret: str, signature: str) -> bool:
    if not (payload_id and webhook_url and secret and signature):
        return False
    digest = hmac.new(
        secret.encode("utf-8"),
        (payload_id + webhook_url).encode("utf-8"),
        hashlib.sha1,
    ).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(expected, signature)
```

## Common Gotchas

- **The body is not signed.** Unlike most providers, Favro does not HMAC the
  request body — it HMACs `payloadId + webhookUrl`. You still parse the body, but
  only to read `payloadId`. Body byte-preservation / raw-body middleware is not
  required for the signature (a notable difference from Stripe/Shopify/GitHub).
- **The URL must match exactly.** `webhookUrl` is the `postToUrl` you registered,
  character for character — scheme, host, path, trailing slash, and query string
  all matter. A mismatch is the #1 cause of verification failures. Store it as
  `FAVRO_WEBHOOK_URL` and keep it identical to what Favro has on file.
- **It's SHA1, not SHA256.** Using SHA256 (the more common default) will never
  match.
- **It's base64, not hex.** The digest is base64-encoded.
- **Verify the ping too.** The setup ping carries a `payloadId`, so it is signed
  with the same scheme. Verify it and return `200`.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`
  and guard against buffer-length mismatches (wrap in try/except).

## How to Debug Verification Failures

1. **Log the header and your computed value.** Compare `X-Favro-Webhook` to your
   `base64(HMAC-SHA1(secret, payloadId + url))`.
2. **Print the exact `payloadId + webhookUrl` string you hashed.** The most
   common bug is a URL that differs from the registered `postToUrl` (extra slash,
   `http` vs `https`, missing query string).
3. **Confirm the algorithm is SHA1 and the encoding is base64.**
4. **Confirm the secret matches** the `secret` you set at webhook creation.
5. **Check you read `payloadId` from the body**, not some other id (`hookId` is
   different).
