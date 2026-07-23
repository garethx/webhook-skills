# How to Verify Lithic Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is public. Without verification, anyone could POST forged
card or payment events to it. Verifying the signature proves the request came
from Lithic and that the body was not tampered with in transit.

## How It Works

Lithic implements the [Standard Webhooks](https://www.standardwebhooks.com/) spec
(powered by Svix). Each delivery includes three headers:

| Header | Meaning |
|--------|---------|
| `webhook-id` | Unique message id (equals the event `token`) |
| `webhook-timestamp` | Unix seconds when the webhook was sent |
| `webhook-signature` | Space-delimited list of `v1,<base64sig>` values |

Svix also emits `svix-id` / `svix-timestamp` / `svix-signature` aliases; Lithic's
docs use the `webhook-*` names. The SDK accepts either.

The signature is computed as:

```
signedContent = `${webhook-id}.${webhook-timestamp}.${rawBody}`
key           = base64Decode(secret without the "whsec_" prefix)
signature     = base64( HMAC_SHA256(key, signedContent) )
```

Verification also checks that `webhook-timestamp` is within a **~5-minute**
tolerance to prevent replay attacks. Multiple signatures may appear (space
separated) during secret rotation — a match against any one is valid.

## Implementation

### SDK Verification (recommended)

The official Lithic SDKs verify **and** parse in one call:
`webhooks.unwrap(rawBody, headers, secret)`. It throws when the signature is
invalid or the timestamp is outside tolerance.

**Node (Express / Next.js):**

```javascript
const Lithic = require('lithic');
const lithic = new Lithic({ apiKey: process.env.LITHIC_API_KEY });

// rawBody must be the exact bytes received (string). Never verify parsed JSON.
const event = lithic.webhooks.unwrap(
  rawBody,
  headers,                          // req.headers or Object.fromEntries(request.headers)
  process.env.LITHIC_WEBHOOK_SECRET
);
// event.event_type, event.token, event.payload
```

**Python (FastAPI):**

```python
from lithic import Lithic
client = Lithic(api_key=os.environ["LITHIC_API_KEY"])

event = client.webhooks.unwrap(
    raw_body,                 # bytes/str of the raw request body
    request.headers,          # Starlette headers (a Mapping)
    secret=os.environ["LITHIC_WEBHOOK_SECRET"],
)
```

Install the verification extra: `pip install "lithic[webhooks]"` (pulls in the
`standardwebhooks` package). `client.webhooks.verify_signature(...)` verifies
without parsing if you only need a boolean-style check.

### Manual Verification (fallback)

If you cannot use the SDK, replicate the algorithm. This is exactly what the SDK
does internally:

```javascript
const crypto = require('crypto');

function verifyLithicSignature(rawBody, headers, secret) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];
  if (!id || !timestamp || !sigHeader) return false;

  // Reject stale timestamps (5-minute tolerance).
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // The header is a space-delimited list of "v1,<sig>" entries.
  return sigHeader.split(' ').some((part) => {
    const sig = part.split(',')[1] || part;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // length mismatch
    }
  });
}
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes received. In Express use
  `express.raw({ type: 'application/json' })`; in Next.js use `await request.text()`;
  in FastAPI use `await request.body()`. Re-serialized JSON will not match.
- **Base64-decode the secret.** The HMAC key is the base64 decode of the part
  after `whsec_`, not the literal string. The SDK does this for you.
- **Header casing.** HTTP header names are case-insensitive; most frameworks
  lowercase them (`webhook-id`). The SDK normalizes casing.
- **Timestamp tolerance.** Deliveries older than ~5 minutes are rejected as
  replays — ensure your server clock is accurate (NTP).
- **Signature is a list.** During secret rotation the header can carry multiple
  space-separated `v1,<sig>` values; accept a match against any one.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always fails | Verifying parsed JSON instead of the raw body |
| Fails after a proxy/gateway | Body re-encoded or headers stripped upstream |
| Intermittent failures | Server clock drift beyond the 5-minute tolerance |
| Fails only in Python | `standardwebhooks` not installed (`pip install "lithic[webhooks]"`) |
| Fails right after rotating | Old secret still in use; support both during overlap |

Return **HTTP 400** on verification failure and **200** once processed. Lithic
retries non-2xx responses with backoff.
