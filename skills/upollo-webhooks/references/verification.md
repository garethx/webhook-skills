# Upollo Signature Verification

## How It Works

Upollo signs every webhook delivery so you can prove it is authentic:

1. Upollo computes `HMAC-SHA512(webhook_secret, raw_request_body)`.
2. It sends the result, plus a timestamp, in the `Upollo-Signature` header as two
   comma-separated `key:value` parts:

   ```
   Upollo-Signature: t:1706352000,s0:3f9a...<128 hex chars>
   ```

   - `t` — Unix timestamp (seconds) of the delivery.
   - `s0` — the HMAC-SHA512 digest of the raw body.
3. Your endpoint recomputes the HMAC over the **raw** body with your webhook
   secret and constant-time compares it to `s0`.

| Property | Value |
|----------|-------|
| Algorithm | **HMAC-SHA512** (not SHA-256) |
| Header | `Upollo-Signature` |
| Header format | `t:<unix_ts>,s0:<digest>` (comma-separated) |
| Signed content | **Raw request body** (exact bytes) |
| Timestamp in signature? | No — `t` is delivered but not part of the HMAC input |
| Encoding | Not documented — **hex** is expected (see below) |
| Key | The webhook secret from the Access & Keys → Webhooks page |
| SDK verification | None — Upollo SDKs don't verify webhooks; verify manually |
| Standard Webhooks? | **No** (`Upollo-Signature`, not `webhook-signature`) |

## The `s0:` Prefix and Encoding

Upollo's docs do not state whether `s0` is hex- or base64-encoded. The `s0:`
label and the observed 128-character value indicate **lowercase hex** (SHA-512 =
64 bytes = 128 hex chars, or 88 base64 chars). Rather than hardcode a guess,
compute the digest once and **constant-time compare against both encodings** —
the correct one matches, the other never will. Confirm hex against one live
delivery, then you can narrow the check.

## Implementation

Upollo publishes no webhook-verification SDK, so verification is manual in every
language. Always hash the **raw** body — parsing then re-serializing JSON changes
bytes (whitespace, key order) and breaks the HMAC.

### Node.js

```javascript
const crypto = require('crypto');

function parseUpolloSignature(header) {
  // "t:1706352000,s0:abc..." -> { t: "1706352000", s0: "abc..." }
  return Object.fromEntries(
    header.split(',').map((part) => {
      const i = part.indexOf(':');
      return [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    })
  );
}

function verifyUpolloWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const { s0 } = parseUpolloSignature(signatureHeader);
  if (!s0) return false;

  const digest = crypto.createHmac('sha512', secret).update(rawBody).digest();
  // Encoding unspecified — accept hex or base64, timing-safe either way.
  return [digest.toString('hex'), digest.toString('base64')].some((expected) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(s0), Buffer.from(expected));
    } catch {
      return false; // length mismatch → not a match
    }
  });
}
```

> Do **not** write `Buffer.from(s0, 'hex')`. If Upollo ever sends base64, that
> silently decodes the wrong bytes instead of failing loudly, and the comparison
> quietly never matches. Compare string-to-string.

### Python

```python
import hmac, hashlib, base64

def verify_upollo_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    parts = dict(p.split(":", 1) for p in signature_header.split(",") if ":" in p)
    s0 = parts.get("s0", "").strip()
    if not s0:
        return False

    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).digest()
    # Encoding unspecified — accept hex or base64, constant-time either way.
    return (
        hmac.compare_digest(s0, digest.hex())
        or hmac.compare_digest(s0, base64.b64encode(digest).decode("utf-8"))
    )
```

## Optional: Replay Protection with `t`

The `t` value is the delivery timestamp. It is **not** part of the signed
content, but you can reject stale deliveries as defence-in-depth:

```javascript
const { t } = parseUpolloSignature(signatureHeader);
const skewSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
if (Number.isFinite(skewSeconds) && skewSeconds > 300) {
  return; // older than 5 minutes — treat as replay
}
```

## Common Gotchas

- **Use the raw body.** Verify the exact received bytes. Express:
  `express.raw()`; Next.js: `await request.text()`; FastAPI:
  `await request.body()`. Never `JSON.stringify(parsedBody)`.
- **SHA-512, not SHA-256.** Upollo uses HMAC-**SHA512**. A SHA-256 digest is 64
  hex chars; `s0` is 128 hex chars.
- **Parse `s0` out of the header.** Don't compare the whole
  `t:...,s0:...` string — extract the `s0` part first.
- **Don't fold `t` into the HMAC.** The digest is over the raw body only.
- **Don't assume an encoding.** Docs never say hex vs base64 — accept both and
  confirm against a live delivery. `s0` has no other prefix beyond `s0:`.
- **Constant-time compare.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`, never `===`.
- **Use the webhook secret**, not your Upollo API key.
- **Header case.** HTTP headers are case-insensitive; frameworks usually expose
  them lowercased (`upollo-signature`).

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Every delivery fails | Body was parsed/re-serialized before hashing — use the raw body |
| Digest length looks wrong | Used SHA-256 instead of SHA-512 (`s0` is 128 hex chars) |
| Signature never matches | Compared the whole header instead of the `s0` part |
| Signature never matches, secret is right | Hardcoded one encoding — log the header, compare hex **and** base64 |
| Works locally, fails in prod | A proxy/body-parser is mutating the body upstream |
| Used the API key | Verify with the **webhook** secret from Access & Keys → Webhooks |
| `timingSafeEqual` throws | Comparing buffers of different lengths — wrap in try/catch, return false |
