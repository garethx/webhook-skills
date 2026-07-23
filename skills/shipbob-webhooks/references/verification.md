# How to Verify ShipBob Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Without verification, anyone could POST
fake "order shipped" or "return created" events and trigger your business logic.
Verifying the signature proves the request was signed with your subscription's
secret and that the body wasn't altered in transit.

## How It Works

ShipBob uses the [Standard Webhooks](https://www.standardwebhooks.com/) scheme
(the same format Svix popularised). Each request carries three signing headers
plus a topic header:

| Header | Purpose |
|--------|---------|
| `webhook-id` | Unique message id — also your idempotency key |
| `webhook-timestamp` | Unix timestamp (seconds) the message was signed |
| `webhook-signature` | Space-delimited versioned signatures, e.g. `v1,<base64>` |
| `x-webhook-topic` | The event topic, e.g. `order.shipped` |

The signature is computed as:

```
signed_content = "{webhook-id}.{webhook-timestamp}.{raw_body}"
signature      = base64( HMAC_SHA256(key, signed_content) )
```

where `key` is derived from the signing secret `whsec_<base64>` by **stripping the
`whsec_` prefix and base64-decoding the remainder**. Compare your computed
signature against the `v1,...` entry in `webhook-signature` using a timing-safe
comparison.

## Implementation

### SDK / package verification (Node.js — recommended)

ShipBob has no official SDK, but because it uses Standard Webhooks you can use the
maintained [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks)
package. It decodes the secret, parses multiple signatures, and enforces the
timestamp window for you.

```javascript
const { Webhook } = require('standardwebhooks');

const wh = new Webhook(process.env.SHIPBOB_WEBHOOK_SECRET); // whsec_...

// rawBody must be the raw request body (Buffer or string), NOT parsed JSON
const event = wh.verify(rawBody, {
  'webhook-id': headers['webhook-id'],
  'webhook-timestamp': headers['webhook-timestamp'],
  'webhook-signature': headers['webhook-signature'],
});
// Throws WebhookVerificationError on tampering or a stale timestamp.
// The topic is a separate header:
const topic = headers['x-webhook-topic'];
```

### Manual verification (fallback — e.g. Python/FastAPI)

There is no official ShipBob Python SDK, so verify manually:

```python
import hmac, hashlib, base64, time

def verify_shipbob_signature(body: bytes, webhook_id: str, webhook_timestamp: str,
                             webhook_signature: str, secret: str) -> bool:
    signed_content = f"{webhook_id}.{webhook_timestamp}.{body.decode()}".encode()
    # 'whsec_<base64>' -> strip prefix, base64-decode the remainder for the raw key
    key = base64.b64decode(secret.split("_", 1)[1])
    expected = base64.b64encode(
        hmac.new(key, signed_content, hashlib.sha256).digest()
    ).decode()
    # webhook-signature is space-delimited, each entry "v1,<sig>"
    sent = [s.split(",", 1)[1] for s in webhook_signature.split(" ") if "," in s]
    return any(hmac.compare_digest(expected, s) for s in sent)  # timing-safe

def timestamp_fresh(webhook_timestamp: str, tolerance: int = 300) -> bool:
    return abs(int(time.time()) - int(webhook_timestamp)) <= tolerance
```

## Common Gotchas

- **Use the raw body.** Verify the exact bytes ShipBob sent. If a framework parses
  JSON and re-serialises it, whitespace/key-order changes break the signature. In
  Express use `express.raw({ type: 'application/json' })`; in Next.js use
  `await request.text()`; in FastAPI use `await request.body()`.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`,
  not the literal string. Signing with the raw `whsec_...` string fails.
- **The topic is a header, not a body field.** Dispatch on `x-webhook-topic`. Don't
  look for a `type`/`event` field in the JSON.
- **Multiple signatures.** `webhook-signature` may contain several space-separated
  `v1,<sig>` entries (e.g. during secret rotation). Accept the message if **any**
  matches.
- **Timestamp tolerance.** Reject messages whose `webhook-timestamp` is outside a
  tolerance window (commonly 5 minutes) to prevent replay. `standardwebhooks`
  enforces this automatically.
- **Idempotency.** Retries reuse the same `webhook-id`. Dedupe on it so retried
  deliveries aren't processed twice.

## How to Debug Verification Failures

1. **Log the computed vs. received signature** (never log the secret). A total
   mismatch usually means the body was mutated or the wrong secret is set.
2. **Confirm you're using the raw body**, byte-for-byte, before any JSON parsing.
3. **Check the secret is decoded** (base64 of the part after `whsec_`).
4. **Check the timestamp window** — a "too old" failure is a stale/replayed
   message or a clock skew issue.
5. **Verify header casing.** HTTP headers are case-insensitive; most frameworks
   lower-case them (`webhook-id`, `webhook-timestamp`, `webhook-signature`,
   `x-webhook-topic`).
