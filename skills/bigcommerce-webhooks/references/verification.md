# BigCommerce Signature Verification

## How It Works

BigCommerce documents webhook signature verification per the
[Standard Webhooks](https://www.standardwebhooks.com/) specification and
advises using Standard Webhooks libraries to verify.

> **What the docs leave open:** BigCommerce's documentation does not currently
> name the delivery headers explicitly, state whether signature verification is
> GA or beta, or clarify whether signatures are sent for all hooks or only
> hooks created by apps. The header names below are what the Standard Webhooks
> spec defines — log the headers on a real delivery to confirm before relying
> on them, and keep [custom headers](setup.md) as a fallback.

Per the Standard Webhooks spec, a signed delivery carries three headers:

| Header | Description |
|--------|-------------|
| `webhook-id` | Unique message id |
| `webhook-timestamp` | Unix timestamp (seconds) when the message was sent |
| `webhook-signature` | Space-separated list of `v1,<base64>` signatures |

The signature is **HMAC-SHA256**, base64-encoded, computed over the signed
content:

```
{webhook-id}.{webhook-timestamp}.{rawBody}
```

### The signing key: base64-encoded client secret

The HMAC key is your app's **client secret**, **base64-encoded** before being
handed to a Standard Webhooks library. The library base64-**decodes** the value
you give it, so:

```
key given to library = base64(client_secret)
actual HMAC key       = base64_decode(base64(client_secret)) = raw client_secret bytes
```

This is the most common source of verification failures — passing the raw client
secret (which the library would then base64-decode into garbage) instead of the
base64-encoded client secret.

> Note: BigCommerce's client secret does **not** use the `whsec_` prefix common
> to some other Standard Webhooks providers. Just base64-encode the secret.

## Implementation

### SDK Verification (recommended — Node & Python)

Use the official `standardwebhooks` library, as BigCommerce advises.

**Node.js:**

```javascript
const { Webhook } = require('standardwebhooks');

// base64-encode the client secret; the library decodes it back to raw bytes
const wh = new Webhook(Buffer.from(process.env.BIGCOMMERCE_CLIENT_SECRET).toString('base64'));

// rawBody must be the exact bytes received (Buffer or string), not re-serialized JSON
const event = wh.verify(rawBody, {
  'webhook-id': req.headers['webhook-id'],
  'webhook-timestamp': req.headers['webhook-timestamp'],
  'webhook-signature': req.headers['webhook-signature'],
});
// Throws WebhookVerificationError on a bad signature or stale timestamp.
// Returns the parsed JSON event on success.
```

**Python:**

```python
import base64
from standardwebhooks.webhooks import Webhook

wh = Webhook(base64.b64encode(os.environ["BIGCOMMERCE_CLIENT_SECRET"].encode()).decode())

event = wh.verify(raw_body, {
    "webhook-id": headers["webhook-id"],
    "webhook-timestamp": headers["webhook-timestamp"],
    "webhook-signature": headers["webhook-signature"],
})
# Raises WebhookVerificationError on a bad signature or stale timestamp.
```

### Manual Verification (fallback / other languages)

If no Standard Webhooks library is available, compute the HMAC yourself:

```javascript
const crypto = require('crypto');

function verify(rawBody, headers, clientSecret) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];
  if (!id || !timestamp || !sigHeader) return false;

  // Replay protection: reject timestamps outside a 5-minute window
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  // HMAC key = raw client-secret bytes (== base64_decode(base64(secret)))
  const key = Buffer.from(clientSecret, 'utf8');
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const signedContent = `${id}.${timestamp}.${body}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent, 'utf8').digest('base64');

  // webhook-signature is a space-separated list of `v1,<base64>` entries
  return sigHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // length mismatch = invalid
    }
  });
}
```

## Common Gotchas

- **Raw body only.** Verify over the exact bytes received. If you `JSON.parse`
  and re-serialize, whitespace/key-order changes break the signature. In Express
  use `express.raw()`; in Next.js use `await req.text()`; in FastAPI use
  `await request.body()`.
- **base64-encode the client secret** before handing it to the library — don't
  pass the raw secret.
- **Signed content order** is `{webhook-id}.{webhook-timestamp}.{body}` — all
  three, dot-separated, in that order.
- **`webhook-signature` can contain multiple signatures** separated by spaces
  (for secret rotation). Accept the message if **any** `v1` entry matches.
- **Header names are lowercase** per Standard Webhooks; HTTP headers are
  case-insensitive, so read them case-insensitively.
- **Timestamp tolerance** is ~5 minutes. A verified-but-stale message is rejected
  as replay protection — make sure your server clock is accurate (NTP).

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Every signature fails | Passing the raw client secret instead of its base64 encoding |
| Works in tests, fails in prod | Body re-serialized by a JSON body parser before verification |
| Intermittent failures | Server clock drift pushing timestamps outside tolerance |
| `Missing required headers` | Reading headers with the wrong case or wrong names |
| Rotated secret breaks delivery | Only checking the first `v1` entry — iterate all space-separated signatures |
