# How to Verify Uber Eats Webhook Signatures

## How It Works

Uber Eats signs every webhook request using HMAC SHA-256. The signature is sent
in the `X-Uber-Signature` header as a **lowercased hex** string (no `sha256=`
prefix):

```
X-Uber-Signature: 7b52009b64fd0a2a49e6d8a939753077792b0554...
```

The signature is computed as:

```
HMAC-SHA256(raw_request_body, client_secret) → lowercase hex
```

The HMAC **key is your app's Client Secret** (from the Uber Developer
Dashboard), and the signed content is the **exact raw request body bytes**. There
is no timestamp and no separate signing secret for Uber Eats.

## Implementation

Uber does not publish an official webhook-verification SDK, so verify manually
in every language. The algorithm is identical across frameworks.

### Node.js

```javascript
const crypto = require('crypto');

function verifyUberWebhook(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader) return false;

  // Compute expected signature: lowercase hex HMAC-SHA256 of the raw body
  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison over the decoded hex bytes
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // Malformed hex or length mismatch
  }
}

// Usage in Express
app.post('/webhooks/uber',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-uber-signature'];
    if (!verifyUberWebhook(req.body, signature, process.env.UBER_CLIENT_SECRET)) {
      return res.status(401).send('Invalid signature');
    }
    // Acknowledge with 200 and an empty body, then process...
    res.status(200).end();
  }
);
```

### Python

```python
import hmac
import hashlib

def verify_uber_webhook(raw_body: bytes, signature_header: str, client_secret: str) -> bool:
    if not signature_header:
        return False

    expected = hmac.new(
        client_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature_header, expected)
```

## Common Gotchas

### 1. Raw Body Requirement

The signature is computed over the raw request body. Re-serializing parsed JSON
(`JSON.stringify(req.body)`) will change the bytes (key order, whitespace) and
fail verification.

**Express:**
```javascript
// WRONG - body is already parsed and re-serialized
app.use(express.json());
app.post('/webhooks/uber', (req, res) => {
  verifyUberWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT - use the raw body buffer
app.post('/webhooks/uber',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyUberWebhook(req.body, ...); // Works!
  }
);
```

In Next.js App Router, read `await request.text()` and verify that string. In
FastAPI, read `await request.body()` (bytes) before parsing.

### 2. Use the Client Secret as the Key

For Uber **Eats**, the HMAC key is your app's **Client Secret** — not a
dedicated webhook secret. Uber Direct uses a different key (see below).

### 3. Hex, Not Base64

Uber's signature is **lowercased hex**. Make sure your digest uses hex encoding:

```javascript
// WRONG
.digest('base64')

// CORRECT
.digest('hex')
```

### 4. Timing-Safe Comparison

Always compare with a timing-safe function (`crypto.timingSafeEqual` /
`hmac.compare_digest`) to avoid leaking information through comparison timing.
`timingSafeEqual` throws on length mismatch, so wrap it in try/catch and return
`false`.

### 5. Acknowledge With an Empty 200 Body

Uber expects HTTP `200` with an **empty response body** to consider the delivery
acknowledged. Returning other 2xx codes or a large body may not be treated as a
successful ack.

## Uber Direct (Deliveries) Differs

If you are integrating **Uber Direct** (the Deliveries API) instead of Uber
Eats, the verification scheme is different:

- The HMAC **key is a dedicated per-webhook Signing Key** you set when creating
  the webhook in the Uber Direct Dashboard — **not** the client secret.
- The signature arrives in `x-uber-signature` and/or the legacy
  `x-postmates-signature` header.
- It is still HMAC-SHA256 hex over the raw body, so the same
  `verify_*` function works — just pass the Signing Key as the secret and read
  the correct header.

Uber Direct is **not** Standard Webhooks (no `webhook-id` / `webhook-timestamp` /
`webhook-signature` headers).

## Debugging Verification Failures

### Compare Signatures

```javascript
const computed = crypto
  .createHmac('sha256', process.env.UBER_CLIENT_SECRET)
  .update(rawBody)
  .digest('hex');
console.log('Computed:', computed);
console.log('Received:', req.headers['x-uber-signature']);
```

### Check the Raw Body

```javascript
console.log('Body is Buffer:', Buffer.isBuffer(req.body));
console.log('Signature header:', req.headers['x-uber-signature']);
```

### Check Your Secret

Ensure `UBER_CLIENT_SECRET` matches your app's Client Secret exactly — watch for
leading/trailing whitespace, copy-paste errors, or using a sandbox secret
against production.

## Full Documentation

For complete details, see
[Uber Eats Webhooks — Security](https://developer.uber.com/docs/eats/guides/webhooks#webhook-security).
