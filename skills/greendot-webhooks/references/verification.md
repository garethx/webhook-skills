# How to Verify Green Dot Webhooks

## Why This Is Different

Green Dot Embedded Finance does **not** use the Standard Webhooks spec and does
**not** rely on a single mandatory HMAC signature. It uses **push
authentication**: Green Dot proves its identity to your endpoint with an OAuth
**client_credentials Bearer token** on every request. An optional
`x-gd-signature` header may add a body signature on top, if your program enables
it.

So "verification" here is two ordered checks:

1. **Authenticate the delivery** — validate the OAuth Bearer token and require
   the `post:webhook` scope. (Primary, always present.)
2. **Verify the payload signature** — validate `x-gd-signature` over the raw
   body, *if* your program sends it. (Optional, program-gated.)

Only parse the JSON body **after** both checks pass.

## 1. OAuth Bearer Token (primary)

Green Dot sends `Authorization: Bearer <token>`. The token is issued by the
client_credentials grant with scope `post:webhook`.

**In production**, validate it against your authorization server:

- If it is a **JWT** (RS256), verify the signature against the issuer's JWKS and
  check `iss`, `aud`, `exp`, and that `scope` contains `post:webhook`.
- If it is **opaque**, call the authorization server's token introspection
  endpoint and check the returned scope.

For a **self-contained, testable** example, the code in this skill validates an
**HS256** JWT signed with a shared secret (`GREENDOT_WEBHOOK_TOKEN_SECRET`) and
requires the `post:webhook` scope. Swap in JWKS/RS256 or introspection for your
real authorization server.

```javascript
const jwt = require('jsonwebtoken');

function verifyToken(authHeader) {
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Missing bearer token');
  const claims = jwt.verify(token, process.env.GREENDOT_WEBHOOK_TOKEN_SECRET); // HS256
  const scopes = String(claims.scope || claims.scp || '').split(/[\s,]+/).filter(Boolean);
  if (!scopes.includes(process.env.GREENDOT_WEBHOOK_SCOPE || 'post:webhook')) {
    throw new Error('Token missing required scope');
  }
  return claims;
}
```

```python
import os, jwt  # PyJWT

def verify_token(auth_header: str) -> dict:
    token = (auth_header or "").removeprefix("Bearer ").strip()
    if not token:
        raise ValueError("Missing bearer token")
    claims = jwt.decode(token, os.environ["GREENDOT_WEBHOOK_TOKEN_SECRET"], algorithms=["HS256"])
    scopes = str(claims.get("scope") or claims.get("scp") or "").replace(",", " ").split()
    if os.environ.get("GREENDOT_WEBHOOK_SCOPE", "post:webhook") not in scopes:
        raise ValueError("Token missing required scope")
    return claims
```

If you use the **Certificate** (mTLS) variant instead of OAuth, the token check
is replaced by client-certificate validation at your TLS terminator / reverse
proxy — there is no application-level token to check.

## 2. Optional x-gd-signature (program-gated)

If your program sends `x-gd-signature`, verify it over the **raw** request body
(never the re-serialized parsed object) using the program signing key, with a
**timing-safe** comparison.

> ⚠️ The exact algorithm and encoding are **not documented publicly**. The
> examples assume **HMAC-SHA256, hex-encoded, over the raw body** — confirm this
> (and obtain the signing key) with your Green Dot representative before relying
> on it in production.

```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signatureHeader) {
  if (!process.env.GREENDOT_SIGNING_KEY) return true;   // not configured → skip
  if (!signatureHeader) return false;                   // configured but missing → reject
  const expected = crypto
    .createHmac('sha256', process.env.GREENDOT_SIGNING_KEY)
    .update(rawBody)                                    // raw body, not parsed JSON
    .digest('hex');
  const a = Buffer.from(String(signatureHeader), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

```python
import hmac, hashlib, os

def verify_signature(raw_body: bytes, signature_header: str | None) -> bool:
    key = os.environ.get("GREENDOT_SIGNING_KEY")
    if not key:
        return True            # not configured → skip
    if not signature_header:
        return False           # configured but missing → reject
    expected = hmac.new(key.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

## 3. Acknowledge Correctly

After both checks pass and you have handled the event, respond `200`/`201` and:

- **Echo the `x-GD-RequestId` header** back on your response.
- Return a `responseDetails` body:

```json
{ "responseDetails": [{ "code": 0, "subCode": 0, "description": "<x-GD-RequestId>" }] }
```

## Common Gotchas

- **Use the raw body** for `x-gd-signature`. Parsing then re-serializing JSON
  changes bytes and breaks the HMAC. Capture the raw body first.
- **Token check is the real gate.** `x-gd-signature` is optional; do not assume
  every delivery is signed. If no signing key is configured, authenticate on the
  Bearer token alone.
- **Always echo `x-GD-RequestId`.** Omitting it (or the `responseDetails` body)
  makes Green Dot treat the delivery as failed and retry it.
- **Timing-safe compare**, and guard against unequal lengths (Node's
  `timingSafeEqual` throws on length mismatch).
- **HTTPS only.** Bearer tokens are secrets in transit; never accept webhooks
  over plain HTTP.
- **Idempotency.** Retries can redeliver the same event for up to 24 hours —
  dedupe on `eventId` / `x-GD-RequestId`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Wrong `GREENDOT_WEBHOOK_TOKEN_SECRET`, expired token, or missing `post:webhook` scope |
| `jwt malformed` / decode error | `Authorization` header not `Bearer <jwt>`, or token is opaque (use introspection instead) |
| Signature check fails | Body was parsed/re-serialized before hashing, wrong signing key, or wrong algorithm/encoding (confirm with your rep) |
| Green Dot keeps retrying | You did not return `200`/`201`, did not echo `x-GD-RequestId`, or omitted the `responseDetails` body |
