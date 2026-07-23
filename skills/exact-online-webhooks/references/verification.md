# How to Verify Exact Online Webhook Signatures

## Why Signature Verification Matters

Anyone who learns your callback URL can POST fake events to it. The `HashCode`
proves the delivery came from Exact Online and was not tampered with, because
only you and Exact know the Webhook secret. Never act on a webhook whose
`HashCode` you have not verified.

## How It Works

Exact Online does **not** use the Standard Webhooks spec and sends **no**
signature header. The signature is the `HashCode` field inside the JSON body:

```json
{ "Content": { … }, "HashCode": "<UPPERCASE HEX>" }
```

`HashCode` is:

```
HMAC-SHA256( key = Webhook secret, message = <raw JSON of the Content node> )
  → hex encode → UPPERCASE
```

The **message is the exact raw bytes of the `Content` node** as they appear in
the request body — the substring starting at the `{` after `"Content":` and
ending at the `}` right before `,"HashCode":`, braces included.

### Why you must use the raw substring (not the re-serialized object)

HMAC is byte-exact. If you `JSON.parse` the body and then `JSON.stringify` the
`Content` object, the result can differ from what Exact signed — key order,
whitespace, number formatting, and Unicode escaping are not guaranteed to round
-trip. That produces a different hash and verification fails. **Extract the
substring from the raw body instead.**

## Implementation

There is **no official Exact Online SDK**, so verification is manual in every
language. The algorithm is identical everywhere.

### Extract the Content substring

```
prefix = '{"Content":'
marker = ',"HashCode":'
start  = indexOf(prefix)                 # normally 0
end    = lastIndexOf(marker)             # HashCode is last, so use lastIndexOf
contentJson = rawBody[start + len(prefix) : end]
```

### Node.js / TypeScript

```javascript
const crypto = require('crypto');

function verifyExactWebhook(rawBody, secret) {
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const prefix = '{"Content":';
  const marker = ',"HashCode":';
  const start = raw.indexOf(prefix);
  const end = raw.lastIndexOf(marker);
  if (start === -1 || end === -1 || end < start) return false;

  const contentJson = raw.slice(start + prefix.length, end);
  let hashCode;
  try { hashCode = JSON.parse(raw).HashCode; } catch { return false; }
  if (!hashCode) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(contentJson, 'utf8').digest('hex').toUpperCase();
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected), Buffer.from(String(hashCode).toUpperCase()));
  } catch { return false; }
}
```

### Python

```python
import hmac, hashlib, json

def verify_exact_webhook(raw_body: bytes, secret: str) -> bool:
    raw = raw_body.decode("utf-8")
    prefix, marker = '{"Content":', ',"HashCode":'
    start = raw.find(prefix)
    end = raw.rfind(marker)
    if start == -1 or end == -1 or end < start:
        return False

    content_json = raw[start + len(prefix):end]
    try:
        hash_code = json.loads(raw)["HashCode"]
    except (ValueError, KeyError):
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        content_json.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest().upper()

    return hmac.compare_digest(expected, str(hash_code).upper())
```

## Common Gotchas

- **Use the raw body.** If your framework parses JSON before you verify, the
  raw bytes are gone. Use `express.raw()`, `await request.text()`, or
  `await request.body()` (bytes) — see the examples.
- **Sign the substring, not the parsed object.** Re-serializing `Content`
  changes the bytes and breaks the hash.
- **Uppercase the hex.** Exact sends `HashCode` in uppercase hex. Compare
  case-insensitively (uppercase both sides) so casing never trips you up.
- **The secret is the Webhook secret, not the OAuth client secret.** They come
  from the same App Center registration but are different values.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`,
  never `==`. Wrap in try/catch — mismatched lengths throw in Node.
- **The signature is a body field, not a header.** Do not look for
  `X-Exact-Signature` or `webhook-signature` — they don't exist.

## How to Debug Verification Failures

1. **Log the raw body and the extracted `contentJson`.** Confirm `contentJson`
   starts with `{` and ends with `}` and matches what's between `{"Content":`
   and `,"HashCode":`.
2. **Print your computed hex (uppercased) next to `HashCode`.** If they differ,
   you're almost certainly hashing re-serialized JSON or the wrong secret.
3. **Confirm the secret.** Ensure `EXACT_WEBHOOK_SECRET` is the App Center
   Webhook secret and has no stray whitespace/newline.
4. **Confirm raw-body access.** Add a temporary log of `typeof body` — if it's
   already an object, a parser ran before verification.
