# How to Verify DocuSign Webhook Signatures

## How It Works

DocuSign Connect signs every webhook with **HMAC-SHA256** over the **exact raw request body**, then **base64**-encodes the digest and sends it in the `X-DocuSign-Signature-1` header. The `x-authorization-digest` header names the algorithm (`HMACSHA256`).

```
HMAC-SHA256(raw_request_body, hmac_secret) → base64  →  X-DocuSign-Signature-1
```

This is **not** the Standard Webhooks spec — there are no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers.

### Multiple signatures (key rotation)

When more than one HMAC key is active on the account, DocuSign computes the signature once **per key** and sends a numbered header for each:

```
X-DocuSign-Signature-1: <base64 digest with key 1>
X-DocuSign-Signature-2: <base64 digest with key 2>
```

**Only one header needs to match** your secret. Verification code should collect every `X-DocuSign-Signature-N` header and accept the request if any of them matches. This lets you rotate keys without downtime: add a new key, deploy the new secret, then delete the old key.

## Implementation

The `docusign-esign` SDKs (Node and Python) manage Connect configurations but provide **no signature helper**, so verify manually on every framework.

### Node.js

```javascript
const crypto = require('crypto');

function verifyDocuSignWebhook(rawBody, headers, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)          // rawBody is a Buffer or the exact raw string
    .digest('base64');

  // Collect every numbered signature header
  const signatures = Object.keys(headers)
    .filter((h) => h.toLowerCase().startsWith('x-docusign-signature-'))
    .map((h) => headers[h]);

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // buffer length mismatch = not a match
    }
  });
}
```

### Python

```python
import hmac
import hashlib
import base64

def verify_docusign_webhook(raw_body: bytes, headers, secret: str) -> bool:
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")

    signatures = [
        value for key, value in headers.items()
        if key.lower().startswith("x-docusign-signature-")
    ]
    return any(hmac.compare_digest(sig, expected) for sig in signatures)
```

## Common Gotchas

### 1. Raw body required

The signature is computed over the raw bytes DocuSign sent. Parse JSON **only after** verifying. In Express, use `express.raw({ type: 'application/json' })`; in Next.js, read `await request.text()`; in FastAPI, use `await request.body()`. Never re-serialize (`JSON.stringify(JSON.parse(body))`) before verifying — it reorders/whitespace-changes the bytes and breaks the digest.

### 2. Base64, not hex

DocuSign's signature is base64-encoded. Using `.digest('hex')` (Node) or `.hexdigest()` (Python) will never match.

### 3. Numbered headers, not one fixed header

Do not hardcode a single `X-DocuSign-Signature` lookup. The header is `X-DocuSign-Signature-1` (…`-2`, `-3`, …). Iterate over all headers whose name starts with `x-docusign-signature-`.

### 4. Timing-safe comparison

Use `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python), not `==`. Wrap Node's comparison in try/catch because it throws on differing buffer lengths.

### 5. The secret is the Connect key value

Use the HMAC key string exactly as generated in **Connect → Connect Keys**. It is used directly as the HMAC key (no decoding step).

## Debugging Verification Failures

```javascript
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
console.log('Body is Buffer:', Buffer.isBuffer(rawBody));
console.log('Expected:', expected);
console.log('Received headers:',
  Object.keys(headers).filter((h) => h.toLowerCase().startsWith('x-docusign-signature-')));
```

Checklist:

- Confirm the body is the raw request, not a re-parsed object.
- Confirm you copied the correct key from **Connect → Connect Keys**.
- Confirm base64 (not hex) encoding.
- If testing from a webhook test tool, disable any "pretty-print" that reformats the JSON body.

## Full Documentation

- [How to validate an HMAC signature](https://developers.docusign.com/platform/webhooks/connect/validate/)
- [DocuSign Connect overview](https://developers.docusign.com/platform/webhooks/connect/)
