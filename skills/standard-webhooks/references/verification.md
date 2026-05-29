# Standard Webhooks Signature Verification

## How It Works

Standard Webhooks supports two signing schemes; the protocol around them is identical.

### Symmetric (HMAC-SHA256) — the default

1. The provider builds the signed string: `<webhook-id>.<webhook-timestamp>.<rawBody>`
2. It HMACs that string with the **base64-decoded** secret (i.e. the bytes after stripping `whsec_`)
3. It base64-encodes the HMAC output
4. It puts `v1,<base64-hmac>` in the `webhook-signature` header

To verify, your code repeats the same steps and compares signatures with a timing-safe equality check.

### Asymmetric (ed25519)

The provider signs `<id>.<timestamp>.<body>` with an ed25519 secret key (`whsk_…`) and ships the public key (`whpk_…`) for you. The signature appears as `v1a,<base64>`. The `standardwebhooks` library auto-detects the scheme from the secret/public-key prefix.

### Timestamp Tolerance

Both schemes recommend rejecting messages older than **5 minutes** to prevent replay attacks. This is the default in the official `standardwebhooks` libraries (JavaScript: `WEBHOOK_TOLERANCE_IN_SECONDS = 5 * 60`).

### Multiple Signatures

The `webhook-signature` header may contain **multiple** space-separated entries during a secret rotation:

```
webhook-signature: v1,<sig-with-old-secret> v1,<sig-with-new-secret>
```

Verification succeeds if **any** signature matches.

## Implementation

### SDK Verification (preferred)

#### Node.js / TypeScript — `standardwebhooks`

```javascript
const { Webhook } = require('standardwebhooks');

const wh = new Webhook(process.env.WEBHOOK_SECRET);
try {
  const event = wh.verify(rawBody, {
    'webhook-id': req.headers['webhook-id'],
    'webhook-timestamp': req.headers['webhook-timestamp'],
    'webhook-signature': req.headers['webhook-signature'],
  });
  // event is the parsed JSON payload
} catch (err) {
  // err is a WebhookVerificationError with a descriptive message
}
```

The library handles tolerance, multi-signature, and ed25519. `rawBody` **must** be the unparsed bytes — passing a parsed JS object will fail because the serialized form will not byte-match what the provider signed.

#### Python — `standardwebhooks`

```python
from standardwebhooks.webhooks import Webhook

wh = Webhook(os.environ["WEBHOOK_SECRET"])
try:
    event = wh.verify(raw_body, {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    })
except WebhookVerificationError as err:
    # invalid signature, missing header, or timestamp out of tolerance
    ...
```

### Manual Verification (for languages/frameworks without an SDK)

```javascript
const crypto = require('crypto');

function verify(secret, headers, rawBody, toleranceSeconds = 300) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) {
    throw new Error('Missing required webhook headers');
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > toleranceSeconds) {
    throw new Error('Timestamp outside tolerance');
  }

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  const expectedBuf = Buffer.from(expected);
  const matched = signatureHeader.split(' ').some((entry) => {
    const [, sig] = entry.split(',');
    if (!sig) return false;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
  if (!matched) throw new Error('No matching signature');
}
```

## Common Gotchas

- **Must use the raw request body.** If you parse JSON first and then re-serialize, key order or whitespace differences will break the HMAC. In Express, mount `express.raw({ type: 'application/json' })` on the webhook route only. In Next.js, call `await request.text()` instead of `request.json()`. In FastAPI, `await request.body()` returns bytes.
- **Decode the secret before HMACing.** The secret is `whsec_` + base64. Use the base64-decoded bytes as the HMAC key — passing the raw `whsec_…` string produces wrong signatures.
- **Multi-signature handling.** Match **any** entry in the space-delimited list. Don't pick only the first one.
- **Timestamp tolerance is ±300s.** Both past and future. Production-fresh webhooks are within seconds of `now`; if you see drift, check your server clock.
- **Header casing.** HTTP header names are case-insensitive, but Node, Next.js, and FastAPI normalize them differently. The `standardwebhooks` library expects lowercase `webhook-id`, `webhook-timestamp`, `webhook-signature` — normalize before passing in.
- **Svix-derived providers send `svix-*` aliases.** Clerk and any provider built on Svix use `svix-id`, `svix-timestamp`, `svix-signature`. The signing scheme is identical — just rename the headers before passing them to `standardwebhooks`.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---|---|
| `No matching signature` | Body was parsed before HMAC; secret is wrong; you forgot to base64-decode the secret |
| `Message timestamp too old` / `too new` | Server clock skew, or you delayed the request through a slow middleware |
| `Missing required headers` | Reverse proxy stripped the `webhook-*` headers (some load balancers strip non-standard headers — allowlist them) |
| `Invalid Signature` from SDK in dev | Localhost tunnel re-encoded the body. Use Hookdeck CLI or `ngrok` with `--inspect=false` |

## Standard Webhooks vs Provider-Specific Implementations

Many providers signed webhooks before Standard Webhooks existed and kept their original scheme:

| Provider | Scheme |
|---|---|
| Stripe | `Stripe-Signature` header, `t=<ts>,v1=<hex>` |
| GitHub | `X-Hub-Signature-256: sha256=<hex>` |
| Shopify | `X-Shopify-Hmac-SHA256: <base64>` (over raw body only — no timestamp) |
| **Standard Webhooks** | `webhook-id` / `webhook-timestamp` / `webhook-signature: v1,<base64>` |

If your provider's docs say "we use Standard Webhooks" or send `webhook-*` / `svix-*` headers, the implementation in this skill applies. Otherwise reach for the provider-specific skill.
