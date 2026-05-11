# Discord Signature Verification

## How It Works

Discord signs every webhook request (including PINGs) with **Ed25519**, an asymmetric signature scheme.

| Element | Value |
|---------|-------|
| Algorithm | Ed25519 (EdDSA over Curve25519) |
| Signature header | `X-Signature-Ed25519` (hex-encoded, 128 chars) |
| Timestamp header | `X-Signature-Timestamp` (UNIX seconds) |
| Signed content | `timestamp + raw_body` (byte concatenation) |
| Key material | Your application's **public key** (hex), from Developer Portal |
| Failure response | Return HTTP `401` |

Because Discord signs with its private key and you verify with the matching public key, no shared secret is involved — there's nothing to rotate on your side unless the underlying app changes.

## Implementation

### Node.js — `discord-interactions` SDK (recommended)

The community-maintained `discord-interactions` package wraps `tweetnacl` and exposes a `verifyKey` helper that handles the byte concatenation and hex decoding for you.

```javascript
const { verifyKey } = require('discord-interactions');

const isValid = verifyKey(
  rawBody,         // Buffer or string
  signatureHeader, // X-Signature-Ed25519 (hex)
  timestampHeader, // X-Signature-Timestamp
  process.env.DISCORD_PUBLIC_KEY
);
```

### Node.js — Manual with `tweetnacl`

```javascript
const nacl = require('tweetnacl');

function verifyDiscord(rawBody, signature, timestamp, publicKey) {
  try {
    return nacl.sign.detached.verify(
      Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]),
      Buffer.from(signature, 'hex'),
      Buffer.from(publicKey, 'hex')
    );
  } catch {
    return false;
  }
}
```

### Python — PyNaCl (recommended)

```python
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError

def verify_discord(body: bytes, signature: str, timestamp: str, public_key: str) -> bool:
    try:
        VerifyKey(bytes.fromhex(public_key)).verify(
            timestamp.encode() + body,
            bytes.fromhex(signature)
        )
        return True
    except (BadSignatureError, ValueError):
        return False
```

## Step-By-Step Algorithm

If you need to implement verification in a language without a NaCl binding:

1. Read the raw, unmodified request body as **bytes**.
2. Read headers `X-Signature-Ed25519` (hex) and `X-Signature-Timestamp` (ASCII string).
3. Form the signed message: `bytes(timestamp_string) || raw_body_bytes`.
4. Decode the public key from hex (32 bytes after decoding).
5. Decode the signature from hex (64 bytes after decoding).
6. Verify the Ed25519 signature against the message.
7. On failure, respond `401`. On success, parse and handle the payload.

## Handling the PING

After signature verification succeeds, check `payload.type`:

```javascript
if (payload.type === 0) {
  // PING - endpoint validation
  return res.status(204).send();
}
```

Discord sends a PING when you save the endpoint URL. The PING **is signed** — so verification must run **before** the type check. A handler that skips verification on PINGs will fail registration.

## Common Gotchas

- **Raw body is mandatory.** Verification uses the exact bytes Discord sent. If your framework auto-parses JSON and you re-serialize, key ordering and whitespace will differ and verification fails. Express requires `express.raw({ type: 'application/json' })`. Next.js App Router gets the raw text via `await request.text()` or `await request.arrayBuffer()`. FastAPI: `await request.body()`.
- **Public key is hex, not base64.** The Developer Portal shows it as a 64-character hex string. Decode with `Buffer.from(key, 'hex')` / `bytes.fromhex(key)`.
- **Signature is hex too.** Same encoding — 128 chars (64 bytes).
- **Timestamp is part of the signed message, not separately verified.** Unlike HMAC-with-timestamp schemes (Stripe, Svix), Discord does not require you to enforce a tolerance window. The Ed25519 signature itself binds the timestamp; Discord protects against replays at their end. You may still enforce a freshness window if you want defense in depth.
- **PING requests are signed.** Don't short-circuit verification when `type === 0`.
- **No SDK for FastAPI.** Discord's own libraries are Node-focused; use PyNaCl directly in Python.
- **Return 401 on failure, not 400.** The Discord docs prescribe `401` for invalid signatures. (Returning 400 still works in practice, but 401 matches the spec.)

## Debugging Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every request fails verification | Wrong `DISCORD_PUBLIC_KEY` | Copy the key from **your** app's General Information page (not a different app) |
| PING works locally but Portal save fails | Tunnel returned non-2XX or timed out | Check Hookdeck logs; ensure your handler returns 2XX within 3s |
| `Bad signature length` / `Bad public key length` | Hex strings have whitespace or wrong length | Trim env vars; verify they're exactly 64 chars (key) / 128 chars (signature) |
| Worked in dev, fails after deploy | Some framework parses+re-serializes JSON | Switch to a raw-body parser; do not call `req.json()` before verifying |
| All events fail except PING | Body was parsed before verification (PING body is small and accidentally re-serializes the same way) | Always verify against the raw bytes |
