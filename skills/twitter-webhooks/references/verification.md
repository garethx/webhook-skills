# How to Verify Twitter / X Webhook Signatures

## How It Works

Twitter/X does **not** follow the Standard Webhooks spec. It uses one HMAC
primitive for two purposes:

- **CRC (GET):** X sends `?crc_token=<token>`; you return
  `{"response_token": "sha256=" + base64(HMAC-SHA256(consumer_secret, crc_token))}`.
- **Event signature (POST):** X sends header
  `x-twitter-webhooks-signature: sha256=<base64 HMAC-SHA256(consumer_secret, raw_body)>`;
  you recompute it over the **raw request body** and compare timing-safe.

Both use:

- **Algorithm:** HMAC-SHA256
- **Key:** your app's **consumer secret** (API Secret Key) — *not* the bearer
  token or user access token
- **Encoding:** Base64, with the literal prefix `sha256=`

There is **no timestamp** in the scheme, so there is **no replay protection**.

## Implementation

There is no official X SDK method for webhook verification across these
frameworks, so verify **manually**. The signing helper is shared between the CRC
response and POST verification.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

// sha256= + base64(HMAC-SHA256(consumerSecret, message))
function buildSignature(message, consumerSecret) {
  return 'sha256=' + crypto
    .createHmac('sha256', consumerSecret)
    .update(message)
    .digest('base64');
}

// CRC GET → { response_token: buildSignature(crcToken, secret) }
function crcResponseToken(crcToken, consumerSecret) {
  return buildSignature(crcToken, consumerSecret);
}

// POST → recompute over the raw body and compare timing-safe
function verifyTwitterSignature(rawBody, signatureHeader, consumerSecret) {
  if (!signatureHeader || !consumerSecret) return false;
  const expected = buildSignature(rawBody, consumerSecret);
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

### Python (FastAPI)

```python
import base64
import hashlib
import hmac


def build_signature(message: bytes, consumer_secret: str) -> str:
    digest = hmac.new(consumer_secret.encode("utf-8"), message, hashlib.sha256).digest()
    return "sha256=" + base64.b64encode(digest).decode("utf-8")


def crc_response_token(crc_token: str, consumer_secret: str) -> str:
    return build_signature(crc_token.encode("utf-8"), consumer_secret)


def verify_twitter_signature(raw_body: bytes, signature_header: str | None, consumer_secret: str | None) -> bool:
    if not signature_header or not consumer_secret:
        return False
    expected = build_signature(raw_body, consumer_secret)
    return hmac.compare_digest(expected, signature_header)
```

## Common Gotchas

- **Use the raw body.** Verify over the exact bytes X sent. Re-serializing parsed
  JSON reorders keys and whitespace and breaks the signature.
- **Use the consumer secret** (API Secret Key) as the HMAC key — a very common
  mistake is using the Bearer Token or an access token, which always fails.
- **Base64, not hex.** The digest is base64-encoded and prefixed with `sha256=`.
  Comparing against a hex string always fails.
- **The CRC is a GET, not a POST.** The `crc_token` comes from the query string,
  and the correct `response_token` is the HMAC of *that token* (not the request
  body).
- **Answer CRC quickly and always.** X re-checks roughly hourly and on demand; a
  wrong or slow `response_token` marks the webhook invalid and stops delivery.
- **No timestamp / no replay protection.** Make handlers idempotent; treat
  delivery as at-most-once.
- **Header case.** Most frameworks lowercase headers, so read
  `x-twitter-webhooks-signature`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| CRC fails at registration | Wrong key (used bearer/access token), hex instead of base64, or missing `sha256=` prefix |
| Every POST returns 401 | Body parsed before verifying (not raw), or wrong consumer secret |
| Works locally, fails in prod | A proxy/body parser mutated the raw body upstream |
| Delivery silently stopped | An hourly CRC re-check failed — verify the GET handler still returns the right `response_token` |
