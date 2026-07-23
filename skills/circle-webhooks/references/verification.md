# How to Verify Circle Webhook Signatures

## Why Signature Verification Matters

Anyone can POST JSON to your public endpoint. Verifying the signature proves the
request genuinely came from Circle and that the body was not modified in transit.
Circle's v2 notifications use an **asymmetric** scheme: Circle signs with a
private key it holds, and you verify with a public key you fetch from Circle's API.

## How It Works

Circle signs each notification with **ECDSA** using **SHA-256**
(`ECDSA_SHA_256`). Two headers accompany every request:

| Header | Meaning |
|--------|---------|
| `X-Circle-Signature` | The digital signature of the notification body, **base64-encoded** |
| `X-Circle-Key-Id` | The **UUID** of the public key that signed the notification |

The signature is computed over the **raw request body** (the exact bytes Circle
sent). Do not parse or re-serialize the JSON before verifying — that changes the
bytes and breaks the signature.

### Steps

1. Read `X-Circle-Signature` and `X-Circle-Key-Id` from the headers. Reject if
   either is missing.
2. Fetch the public key for that keyId (cache it — the key for a keyId is static):
   ```
   GET https://api.circle.com/v2/cpn/notifications/publicKey/{keyId}
   Authorization: Bearer $CIRCLE_API_KEY
   ```
   The response returns `data.algorithm` (`ECDSA_SHA_256`) and `data.publicKey`,
   a **base64-encoded DER (SPKI)** key.
3. Decode the base64 public key and load it as a DER/SPKI EC public key.
4. Verify the base64-decoded signature over the **raw body** using ECDSA-SHA256.

Circle's signatures (and both official Node/Python examples) use the **DER**
ECDSA encoding — which is the default for Node's `crypto.verify` and Python's
`cryptography`. You do not need to configure P1363/IEEE encoding.

## Implementation

### Manual Verification — Node.js

Circle only ships a Node SDK for its wallet products (not a webhook-verify
helper), so verify manually with the built-in `crypto` module:

```javascript
const { createPublicKey, createVerify } = require('crypto');

const publicKeyCache = new Map();

async function getPublicKey(keyId) {
  if (publicKeyCache.has(keyId)) return publicKeyCache.get(keyId);
  const res = await fetch(
    `https://api.circle.com/v2/cpn/notifications/publicKey/${keyId}`,
    { headers: { Authorization: `Bearer ${process.env.CIRCLE_API_KEY}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch public key: ${res.status}`);
  const { data } = await res.json();
  const publicKey = createPublicKey({
    key: Buffer.from(data.publicKey, 'base64'), // base64 DER (SPKI)
    format: 'der',
    type: 'spki',
  });
  publicKeyCache.set(keyId, publicKey);
  return publicKey;
}

async function verifyCircleWebhook(headers, rawBody) {
  const signature = headers['x-circle-signature'];
  const keyId = headers['x-circle-key-id'];
  if (!signature || !keyId) return false;

  let publicKey;
  try {
    publicKey = await getPublicKey(keyId);
  } catch {
    return false;
  }

  const verifier = createVerify('SHA256');
  verifier.update(rawBody);       // raw bytes, not parsed JSON
  verifier.end();
  try {
    return verifier.verify(publicKey, signature, 'base64');
  } catch {
    return false; // malformed signature — fail closed
  }
}
```

### Manual Verification — Python

```python
import base64, os, httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

public_key_cache = {}

def get_public_key(key_id):
    if key_id in public_key_cache:
        return public_key_cache[key_id]
    resp = httpx.get(
        f"https://api.circle.com/v2/cpn/notifications/publicKey/{key_id}",
        headers={"Authorization": f"Bearer {os.environ['CIRCLE_API_KEY']}"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    key = serialization.load_der_public_key(base64.b64decode(data["publicKey"]))
    public_key_cache[key_id] = key
    return key

def verify_circle_webhook(headers, raw_body: bytes) -> bool:
    signature_b64 = headers.get("x-circle-signature")
    key_id = headers.get("x-circle-key-id")
    if not signature_b64 or not key_id:
        return False
    try:
        public_key = get_public_key(key_id)
        public_key.verify(
            base64.b64decode(signature_b64),
            raw_body,                 # raw bytes, not parsed JSON
            ec.ECDSA(hashes.SHA256()),
        )
        return True
    except (InvalidSignature, ValueError, TypeError, httpx.HTTPError):
        return False
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes received. Re-serializing
  the parsed JSON changes whitespace/key order and breaks the signature. In
  Express use `express.raw()`; in Next.js read `request.arrayBuffer()`; in
  FastAPI read `await request.body()` before `request.json()`.
- **Header casing.** HTTP frameworks lowercase headers — read `x-circle-signature`
  / `x-circle-key-id`. Both `X-Circle-...` and lowercase refer to the same header.
- **Cache the public key.** The key for a given keyId is static; fetching it on
  every event adds latency and can rate-limit you. Cache by keyId.
- **DER signature encoding.** Circle's signature is DER-encoded ECDSA — the
  default for both `crypto.verify` and `cryptography`. Don't force P1363.
- **Fail closed.** If the key can't be fetched or the signature is malformed,
  treat the request as invalid (return 400) rather than throwing a 500.
- **Handle the HEAD request.** Circle validates the endpoint with a HEAD request
  on subscription create/update — return 200 to HEAD as well as POST.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails, valid-looking signature | Body was parsed/re-serialized before verifying — use the raw body |
| Fails only for some events | Key rotated; make sure you fetch by the request's `X-Circle-Key-Id`, not a hardcoded key |
| 500 error instead of 400 | Wrap `verify`/`load_der_public_key` in try/except and return false on error |
| Can't fetch the public key | Check `CIRCLE_API_KEY` and `CIRCLE_API_BASE_URL` (sandbox vs production) |
