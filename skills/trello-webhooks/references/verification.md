# Trello Signature Verification

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Anyone who discovers it can POST fake events.
Verifying the `x-trello-webhook` signature proves the request was signed with your
OAuth 1.0 application secret and that the body was not tampered with in transit.

## How It Works

Trello computes:

```
signature = base64( HMAC-SHA1( rawRequestBody + callbackURL, applicationSecret ) )
```

and sends it in the **`x-trello-webhook`** header.

- **Algorithm**: HMAC-**SHA1** (not SHA256).
- **Encoding**: **base64**.
- **Signed content**: the **raw request body** immediately followed by the **exact
  `callbackURL`** you used when the webhook was created (no separator).
- **Secret**: your Power-Up's **OAuth 1.0 application secret** (the "OAuth1.0 secret"
  on the API Key tab).
- Trello does **not** implement the Standard Webhooks spec — there is no `webhook-id`,
  `webhook-timestamp`, or `webhook-signature` header.

## Implementation

Trello has no official server-side SDK for webhook verification (its published
libraries are browser-side), so verify manually. Always use the **raw** request body —
if you parse and re-serialize the JSON first, the bytes change and the signature will
not match.

### Node.js

```javascript
const crypto = require('crypto');

function verifyTrelloWebhook(rawBody, signature, secret, callbackURL) {
  if (!signature) return false;
  const content = Buffer.concat([Buffer.from(rawBody), Buffer.from(callbackURL)]);
  const expected = crypto.createHmac('sha1', secret).update(content).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}
```

### Python

```python
import hmac, hashlib, base64

def verify_trello_webhook(raw_body: bytes, signature: str, secret: str, callback_url: str) -> bool:
    if not signature:
        return False
    digest = hmac.new(secret.encode(), raw_body + callback_url.encode(), hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)
```

## The HEAD Validation Request

When you create the webhook, Trello first sends an HTTP **`HEAD`** request to the
callback URL. If it does not return **`200`**, the webhook is **not created**. This
`HEAD` request carries no body and no signature, so your route must answer `HEAD` with
`200` *without* running signature verification. See the example handlers for how each
framework wires this up.

## Common Gotchas

- **SHA1, not SHA256.** Copying a Stripe/GitHub/Shopify verifier and leaving `sha256`
  is the most common bug — it will silently fail every request.
- **The callback URL is part of the signed content.** Verify against the *exact* URL
  registered at creation (`TRELLO_CALLBACK_URL`), byte-for-byte — including scheme,
  host, path, and any trailing slash or query string. A proxy that rewrites the path,
  or a `TRELLO_CALLBACK_URL` that differs from what you registered, breaks
  verification.
- **Use the raw body.** Verify the exact bytes received. Re-serialized JSON (different
  key order or whitespace) produces a different signature.
- **base64, not hex.** The digest is base64-encoded.
- **Use the OAuth 1.0 application secret**, not the API key and not an API token.
- **Handle the HEAD request.** Do not require a signature on `HEAD` — creation would
  fail.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`, and
  guard against buffer-length mismatches (they throw).

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Every request fails | Using `sha256` instead of `sha1`, or hex instead of base64 |
| Worked in dev, fails in prod | `TRELLO_CALLBACK_URL` differs from the registered URL (host/path/slash) |
| Intermittent failures | Body parsed before verification (re-serialized), or a proxy mutating the body |
| Webhook won't create at all | Endpoint didn't return `200` to the `HEAD` check, or invalid SSL cert |
| `timingSafeEqual` throws | Compare buffers of different length — wrap in try/catch and return false |

## Reference

- [Trello webhook signatures](https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/#webhook-signatures)
