# Ethoca Webhook Verification

## How It Works (There Is No Signature)

Most webhook providers sign the payload with an HMAC and put the digest in a
header you recompute and compare. **Ethoca does not.** There is no
`X-Ethoca-Signature`, no HMAC, and this is **not** Standard Webhooks
(`webhook-id` / `webhook-timestamp` / `webhook-signature`).

Authenticity of an Ethoca Alerts Push delivery rests on two layers you set up
during onboarding:

1. **Mutual TLS (MSSL)** — the transport. Ethoca presents a client certificate
   chaining to the **Entrust** CA. Your TLS terminator trusts that CA and
   requires a valid client cert, so only Ethoca can complete the connection.
2. **HTTP Basic Auth** — the application check. Every POST carries
   `Authorization: Basic base64(username:password)` with credentials agreed
   during onboarding.

A third recommended layer is an **IP allowlist** of Ethoca's egress ranges.

Because there is no signature over the body, the raw request bytes are not
security-critical, and ordinary JSON body parsing is safe here. Do **not**
fabricate an HMAC check — there is nothing to verify against.

## Implementation — Basic Auth (what your handler checks)

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch — guard first
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function verifyEthocaAuth(authHeader, username, password) {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const i = decoded.indexOf(':'); // split on FIRST colon; passwords may contain ':'
  if (i === -1) return false;
  return safeEqual(decoded.slice(0, i), username) &&
         safeEqual(decoded.slice(i + 1), password);
}
```

### Python

```python
import base64
import hmac

def verify_ethoca_auth(authorization: str, username: str, password: str) -> bool:
    if not authorization or not authorization.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(authorization[6:]).decode("utf-8")
    except Exception:
        return False
    if ":" not in decoded:
        return False
    user, _, pw = decoded.partition(":")  # split on FIRST colon
    return hmac.compare_digest(user, username) and hmac.compare_digest(pw, password)
```

## Enforcing mTLS (infrastructure, not app code)

mTLS is terminated by your load balancer / reverse proxy. For example, with nginx:

```nginx
server {
    listen 443 ssl;
    ssl_certificate     /etc/ssl/your-server.crt;
    ssl_certificate_key /etc/ssl/your-server.key;

    # Trust Ethoca's client cert chain (Entrust CA bundle) and require a client cert
    ssl_client_certificate /etc/ssl/entrust-ca-bundle.pem;
    ssl_verify_client on;
    ssl_verify_depth 3;

    location /webhooks/ethoca {
        proxy_pass http://app_upstream;
    }
}
```

Connections without a valid Ethoca client certificate are rejected at the TLS
handshake, before your application ever sees the request.

## Outbound: the Outcome API uses OAuth 1.0a (not Basic Auth)

Reporting an outcome back to Ethoca is a **separate outbound call** and uses a
different scheme entirely: **OAuth 1.0a** signed with an RSA key from a **PKCS#12
(`.p12`) keystore** issued by Mastercard. Use the official signer helper rather
than hand-rolling the signature:

- Node.js: [`mastercard-oauth1-signer`](https://www.npmjs.com/package/mastercard-oauth1-signer)
- Python: [`mastercard-oauth1-signer`](https://pypi.org/project/mastercard-oauth1-signer/)

```javascript
const oauth = require('mastercard-oauth1-signer');
const fs = require('fs');
const forge = require('node-forge');

// Load the RSA private key from your Mastercard-issued .p12 keystore
const p12 = fs.readFileSync('./ethoca-keystore.p12');
const signingKey = /* extract private key from p12 with the keystore password */;

const uri = 'https://api.ethoca.com/.../outcomes';
const body = JSON.stringify({ /* outcome payload */ });
const authHeader = oauth.getAuthorizationHeader(uri, 'POST', body, consumerKey, signingKey);
// send POST with header: Authorization: <authHeader>
```

Do **not** reuse the inbound Basic Auth credentials for the Outcome API, and do
**not** use the `ETHOCA-SHA1` HMAC scheme (that belongs to the separate **Ethoca
Consumer Clarity** product, not Alerts).

## Common Gotchas

- **Do not look for a signature header.** There is no HMAC on push alerts.
  Verification = mTLS + Basic Auth.
- **Split the decoded credentials on the first colon only.** Passwords can
  contain `:`.
- **Use a timing-safe comparison** (`crypto.timingSafeEqual` / `hmac.compare_digest`)
  and guard against length mismatch, which throws in Node.
- **Return `401`** for missing or invalid credentials, `200` to acknowledge a
  valid alert.
- **mTLS cannot be exercised through a local tunnel** (the tunnel terminates
  TLS). Validate it in staging.
- **Consumer Clarity ≠ Alerts.** The `ETHOCA-SHA1 KeyRef=...,Signature=...`
  header belongs to Consumer Clarity; never apply it to Alerts.

## Debugging Verification Failures

- `401` on every request: confirm `ETHOCA_WEBHOOK_USERNAME` / `ETHOCA_WEBHOOK_PASSWORD`
  exactly match what Ethoca was configured with (watch trailing whitespace).
- TLS handshake failures: your terminator is missing the **Entrust CA bundle**,
  or `ssl_verify_client` is misconfigured.
- Requests never arrive: confirm the endpoint URL registered with the Customer
  Delivery Team and that your IP allowlist includes Ethoca's egress ranges.

## Full Documentation

- [Ethoca Alerts API basics](https://developer.mastercard.com/ethoca-alerts-for-merchants/documentation/api-basics/)
- [Ethoca Alerts Push API reference](https://developer.mastercard.com/ethoca-alerts-for-merchants/documentation/api-reference/push-api-ref/)
