# How to Verify Fireblocks Webhook Signatures

## Why Signature Verification Matters

A webhook endpoint is a public URL. Anyone can `POST` to it. Because Fireblocks webhooks concern movement of digital assets, verifying that a request genuinely came from Fireblocks — and was not tampered with — is essential before acting on any event.

## How It Works (Webhooks v2 — current)

Fireblocks v2 signs each request with a **detached JWS** (JSON Web Signature):

- **Header:** `Fireblocks-Webhook-Signature`
- **Algorithm:** `RS512` (RSA signature with SHA-512), PKCS#1 v1.5
- **Signed content:** the **raw request body** (unmodified bytes)
- **Keys:** Fireblocks' **public** keys, served from a regional **JWKS** endpoint; the JWS `kid` selects the key. Keys rotate automatically.

The header value is a **detached** compact JWS — the middle (payload) segment is empty:

```
<base64url protected header>..<base64url signature>
```

To verify you **reconstruct the full JWS** by inserting the base64url-encoded raw body as the payload segment, then verify the signature against the JWKS.

### JWKS endpoints by environment

| Environment | JWKS URL |
|-------------|----------|
| US Production | `https://keys.fireblocks.io/.well-known/jwks.json` |
| EU | `https://eu-keys.fireblocks.io/.well-known/jwks.json` |
| EU2 | `https://eu2-keys.fireblocks.io/.well-known/jwks.json` |
| Sandbox | `https://sandbox-keys.fireblocks.io/.well-known/jwks.json` |

## Implementation

There is **no official signature-verification helper** in the Fireblocks SDKs (they manage webhook *configuration* only). Use a standard JWS library.

### Node.js / TypeScript (`jose`)

```javascript
import { createRemoteJWKSet, compactVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://keys.fireblocks.io/.well-known/jwks.json')
);

export async function verifyFireblocksWebhook(rawBody, signatureHeader) {
  const [header, , signature] = signatureHeader.split('.'); // detached: header .. signature
  const payload = Buffer.from(rawBody).toString('base64url'); // raw body → JWS payload
  const fullJws = `${header}.${payload}.${signature}`;
  const { payload: verified } = await compactVerify(fullJws, JWKS, {
    algorithms: ['RS512'], // pin the algorithm to avoid alg-confusion attacks
  });
  return JSON.parse(Buffer.from(verified).toString('utf8'));
}
```

`createRemoteJWKSet` fetches and caches the key set and picks the key by `kid`.

### Python (`jwcrypto`)

```python
import base64, json
from jwcrypto import jwk, jws
import requests

class FireblocksVerifier:
    def __init__(self, jwks_url):
        self._url = jwks_url
        self._jwks = None

    def _get_jwks(self):
        if self._jwks is None:
            r = requests.get(self._url, timeout=10)
            r.raise_for_status()
            self._jwks = jwk.JWKSet.from_json(r.text)
        return self._jwks

    def verify(self, raw_body: bytes, signature_header: str) -> dict:
        header, _, signature = signature_header.split(".")   # detached JWS
        payload = base64.urlsafe_b64encode(raw_body).rstrip(b"=").decode()
        full_jws = f"{header}.{payload}.{signature}"
        token = jws.JWS()
        token.deserialize(full_jws)
        token.verify(self._get_jwks(), alg="RS512")          # raises on failure
        return json.loads(raw_body)
```

## Legacy Verification (Webhooks v1 — deprecated)

The older v1 scheme used a different header and a **static** per-environment public key:

- **Header:** `Fireblocks-Signature`
- **Algorithm:** RSA PKCS#1 v1.5 over the **SHA-512** hash of the raw body
- **Encoding:** base64
- **Key:** a static PEM public key published in the Fireblocks docs (separate keys for US, EU/EU2, and Sandbox)

During migration, both `Fireblocks-Signature` (v1) and `Fireblocks-Webhook-Signature` (v2) headers were sent. The v1 scheme reached its migration deadline on **March 20, 2026**. New integrations should use the v2 JWKS scheme above; keep v1 only if you must support a not-yet-migrated workspace.

Legacy verification (Node), for reference:

```javascript
import crypto from 'crypto';

// Static per-environment public key from the Fireblocks docs (US shown).
const FIREBLOCKS_PUBLIC_KEY_US = `-----BEGIN PUBLIC KEY-----
...paste the environment's PEM key from the Fireblocks docs...
-----END PUBLIC KEY-----`;

function verifyLegacy(rawBody, signatureBase64, publicKey = FIREBLOCKS_PUBLIC_KEY_US) {
  const verifier = crypto.createVerify('RSA-SHA512');
  verifier.update(rawBody);        // raw body bytes
  return verifier.verify(publicKey, signatureBase64, 'base64');
}
```

## Common Gotchas

1. **Use the raw body, not parsed JSON.** JSON parsing and re-serializing changes whitespace/key order and breaks the signature. Capture the raw bytes before any body parser runs (`express.raw(...)` in Express, `await req.arrayBuffer()` in Next.js, `await request.body()` in FastAPI).
2. **The header payload segment is empty.** `Fireblocks-Webhook-Signature` is a *detached* JWS: `header..signature`. Splitting on `.` yields three parts with an empty middle. You must reinsert the base64url raw body before verifying.
3. **Pin the algorithm to `RS512`.** Passing `algorithms: ['RS512']` (or `alg="RS512"`) prevents algorithm-confusion attacks.
4. **Match the region.** A Sandbox-signed webhook only verifies against the Sandbox JWKS. Set `FIREBLOCKS_WEBHOOK_ENV` (or `FIREBLOCKS_JWKS_URL`) to the correct environment.
5. **base64url without padding.** When reconstructing the JWS payload, encode the raw body as base64url and strip `=` padding (Node's `toString('base64url')` already does this; in Python, `rstrip(b"=")`).
6. **Don't confuse the two headers.** `Fireblocks-Signature` is legacy v1 (static-key RSA); `Fireblocks-Webhook-Signature` is v2 (JWKS detached JWS). This skill verifies v2.

## Debugging Verification Failures

- **"no applicable key found in the JSON Web Key Set"** — the `kid` in the JWS header isn't in the JWKS you fetched. Check you're pointing at the right regional JWKS endpoint for your workspace.
- **"signature verification failed"** — almost always a raw-body problem. Log `typeof`/length of the body you're verifying; it must be the exact bytes received. Ensure no JSON parser ran first and no proxy re-encoded the body.
- **Malformed header** — confirm the header splits into exactly three `.`-separated parts (with an empty middle). If you only see `Fireblocks-Signature`, you're receiving v1 and need the legacy path.
- **Works locally, fails in prod** — check that your reverse proxy/load balancer isn't buffering and re-serializing the JSON body.

## Full Documentation

See the Fireblocks [webhook validation guide](https://developers.fireblocks.com/reference/validating-webhooks) and [Webhooks v2 overview](https://developers.fireblocks.com/reference/webhooks-v2).
