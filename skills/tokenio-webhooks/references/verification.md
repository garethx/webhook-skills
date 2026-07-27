# How to Verify Token.io Webhook Signatures

## Why Signature Verification Matters

Token.io webhooks trigger money-related state changes in your system. Anyone who
learns your endpoint URL could POST a forged `PAYMENT_STATUS_CHANGED` event.
Verifying the Ed25519 signature proves the delivery genuinely came from Token.io
and was not tampered with in transit.

## How Token.io Signing Works

Token.io uses an **asymmetric** scheme — this is **not** HMAC and **not**
[Standard Webhooks](https://www.standardwebhooks.com/):

- Token.io holds the **private** Ed25519 key and signs each webhook.
- You hold the **public** Ed25519 key (from the Dashboard) and verify.
- The **signed message is the exact raw bytes of the POST body** — nothing else
  (no timestamp prefix, no message-id concatenation).

Headers on every delivery:

| Header | Contents |
|--------|----------|
| `token-signature` | Ed25519 signature of the raw body, **base64url** encoded |
| `token-event` | The event type (e.g. `PAYMENT_STATUS_CHANGED`) — dispatch on this |

The public key from **Settings → Member Information** is base64url-encoded with
**no padding** — it is the 32-byte raw Ed25519 public key, which is exactly the
`x` value of an `OKP`/`Ed25519` JWK.

## Implementation

There is no dedicated webhook-verification SDK. The `token-io` npm package is an
API client for calling Token endpoints (including `PUT /webhook/config`), not a
verifier. Verify manually with your language's crypto primitives.

### Node.js (Express / Next.js) — built-in `crypto`

```javascript
const crypto = require('crypto');

function verifyTokenWebhook(rawBody, signatureHeader, publicKeyB64url) {
  if (!signatureHeader || !publicKeyB64url) return false;
  try {
    // Import the base64url public key as an Ed25519 JWK.
    const key = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: publicKeyB64url },
      format: 'jwk',
    });
    const message = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    // Ed25519 → algorithm arg is null. base64url-decode the signature.
    return crypto.verify(null, message, key, Buffer.from(signatureHeader, 'base64url'));
  } catch {
    return false; // malformed key or signature = invalid
  }
}
```

### Python (FastAPI) — `cryptography`

```python
import base64
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)  # base64url from Token has no padding
    return base64.urlsafe_b64decode(value + padding)


def verify_token_webhook(raw_body: bytes, signature_header: str, public_key_b64url: str) -> bool:
    if not signature_header or not public_key_b64url:
        return False
    try:
        key = Ed25519PublicKey.from_public_bytes(_b64url_decode(public_key_b64url))
        key.verify(_b64url_decode(signature_header), raw_body)
        return True
    except (InvalidSignature, ValueError):
        return False
```

## Common Gotchas

- **Use the raw body, not re-serialized JSON.** Ed25519 signs exact bytes.
  Parsing then re-stringifying reorders keys / changes whitespace and unicode
  escaping, breaking the signature. Capture the raw bytes *before* JSON parsing.
  - Express: `express.raw({ type: '*/*' })`, not `express.json()`.
  - Next.js: `await request.text()`, not `await request.json()`.
  - FastAPI: `await request.body()`, not the parsed model.
- **base64url, not base64.** Both the signature header and the public key use the
  URL-safe alphabet (`-` / `_`) with no padding. Node's `'base64url'` encoding
  and Python's `urlsafe_b64decode` (after re-padding) handle this. Standard
  base64 decoding may silently mis-decode `-`/`_`.
- **Public key is asymmetric, not a secret.** `TOKEN_WEBHOOK_PUBLIC_KEY` is a
  public key — there is no HMAC shared secret to protect. Never try to HMAC the
  body with it.
- **Header casing.** HTTP headers are case-insensitive; frameworks lower-case
  them. Read `token-signature` and `token-event` in lowercase.
- **Event type is a header, not a body field.** Dispatch on the `token-event`
  header. Do not look for an `event`/`type` field in the JSON.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always fails, even on genuine deliveries | Body was parsed/re-serialized before verifying — verify the raw bytes |
| `ERR_OSSL` / key import throws | Public key isn't the base64url `x` value — copy it verbatim from the Dashboard |
| Works locally, fails in prod | Wrong environment's public key (Sandbox vs Production key mismatch) |
| Intermittent failures | A proxy/body parser is mutating the payload before your handler |
| Signature "wrong length" errors | Header decoded as standard base64 instead of base64url |
