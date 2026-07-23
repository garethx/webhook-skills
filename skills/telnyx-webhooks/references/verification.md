# How to Verify Telnyx Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Without verification, anyone who discovers it can POST
fake events (fake inbound messages, fake delivery statuses). Verifying the Ed25519 signature
proves the request genuinely came from Telnyx and that the body wasn't tampered with in transit.

## How It Works

Telnyx Webhook API **v2** signs each event with **Ed25519 public-key cryptography**:

| Item | Value |
|------|-------|
| Algorithm | Ed25519 (asymmetric) |
| Signature header | `telnyx-signature-ed25519` — base64-encoded 64-byte signature |
| Timestamp header | `telnyx-timestamp` — Unix seconds when the event was signed |
| Signed message | `` `${telnyx-timestamp}|${raw_body}` `` (timestamp, a literal `|`, then the raw body) |
| Public key | Your account's base64 public key (32 bytes) from Mission Control → Account Settings → Keys & Credentials → Public Key |
| Replay window | Reject if `telnyx-timestamp` is more than **300 seconds** (5 min) from now |

This is **not** HMAC and **not** the [Standard Webhooks](https://www.standardwebhooks.com/)
spec — it is asymmetric signing, so you verify with a **public** key and there is no shared
secret to protect.

## SDK Situation (Important)

Telnyx publishes official SDKs (`telnyx@7` for Node, `telnyx` for Python), and both expose a
`client.webhooks.unwrap(body, { headers, key })` method. **In the current pinned versions this
method does not verify real Telnyx webhooks**: it delegates to the `standardwebhooks` library,
which expects `webhook-id` / `webhook-signature` / `webhook-timestamp` headers and an HMAC-style
secret — not Telnyx's `telnyx-signature-ed25519` / `telnyx-timestamp` Ed25519 scheme. Passing a
genuine Telnyx request to `unwrap()` throws `Missing required headers`.

The Node package *does* ship a correct native Ed25519 implementation internally (the
`TelnyxWebhook` class under the `telnyx/lib/webhooks` subpath), but relying on an undocumented
internal subpath is fragile. **The robust, portable approach — used by all three examples in
this skill — is to verify the Ed25519 signature directly** with a maintained crypto library
(`tweetnacl` for Node, `PyNaCl` for Python). This matches Telnyx's actual scheme exactly and
works identically across Express, Next.js, and FastAPI.

## Implementation

### Node (`tweetnacl`)

```javascript
const nacl = require('tweetnacl');

function verifyTelnyxSignature(rawBody, signature, timestamp, publicKeyB64) {
  // Replay guard: reject timestamps outside a 5-minute window.
  const now = Math.floor(Date.now() / 1000);
  const webhookTime = parseInt(timestamp, 10);
  if (!Number.isFinite(webhookTime) || Math.abs(now - webhookTime) > 300) return false;

  // Signed content is `timestamp|body` — RAW body, never re-serialized JSON.
  const message = Buffer.concat([
    Buffer.from(`${timestamp}|`, 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8'),
  ]);

  try {
    return nacl.sign.detached.verify(
      new Uint8Array(message),
      new Uint8Array(Buffer.from(signature, 'base64')),   // base64 sig
      new Uint8Array(Buffer.from(publicKeyB64, 'base64')) // base64 public key
    );
  } catch {
    return false; // malformed base64 / wrong key or signature length
  }
}
```

### Python (`PyNaCl`)

```python
import base64
import time
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError

def verify_telnyx_signature(raw_body: bytes, signature: str, timestamp: str, public_key_b64: str) -> bool:
    # Replay guard: reject timestamps outside a 5-minute window.
    try:
        webhook_time = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(int(time.time()) - webhook_time) > 300:
        return False

    # Signed content is `timestamp|body` — RAW body, never re-serialized JSON.
    signed = f"{timestamp}|".encode("utf-8") + raw_body

    try:
        VerifyKey(base64.b64decode(public_key_b64)).verify(signed, base64.b64decode(signature))
        return True
    except (BadSignatureError, ValueError):
        return False
```

## Common Gotchas

- **Use the raw body.** Ed25519 verifies the exact bytes Telnyx signed. If you parse JSON and
  re-serialize it (key order, whitespace, unicode escaping all change), verification fails.
  Read the raw body first — `express.raw()`, `await request.text()`, `await request.body()`.
- **Signature and key are base64, not hex.** Discord's Ed25519 uses hex; Telnyx uses base64.
  Decode both `telnyx-signature-ed25519` and `TELNYX_PUBLIC_KEY` with base64.
- **The separator is a literal `|`.** The signed message is `timestamp` + `|` + body, not
  `timestamp` + body (Discord's scheme) and not `timestamp.body` (Stripe's scheme).
- **Public key is per-account.** One account public key verifies every messaging profile and
  product — you don't need a different key per profile.
- **Header names are lowercase** in most frameworks. Look up `telnyx-signature-ed25519` and
  `telnyx-timestamp` case-insensitively.
- **Enforce the timestamp tolerance.** Without it, a captured request can be replayed forever.
  Telnyx's SDK default is 300 seconds.
- **Don't call `client.webhooks.unwrap()` expecting it to verify Telnyx webhooks** in the
  pinned SDK versions — see the SDK Situation note above.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails, even on genuine events | Re-serializing the body before verifying; using hex instead of base64; wrong separator |
| Works locally, fails behind a proxy/tunnel | A middleware parsed and re-emitted the JSON body — capture the raw body earlier |
| Fails only sometimes | Clock skew pushing `telnyx-timestamp` outside the 300s window — sync server time (NTP) |
| `Invalid key format` / wrong length | Public key isn't the 32-byte base64 account key, or an extra newline was copied |
| Using the SDK and getting `Missing required headers` | `client.webhooks.unwrap()` is checking Standard Webhooks headers — verify manually instead |
