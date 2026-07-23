# How to Verify Retell AI Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Signature verification proves a request
genuinely came from Retell (and wasn't forged or replayed), so you only act on
authentic call events.

## How It Works

Retell uses its own signing scheme (**not** Standard Webhooks / Svix):

1. **Header**: `X-Retell-Signature`
2. **Format**: `v={timestamp},d={digest}`
   - `v` = Unix timestamp in **milliseconds**
   - `d` = hex-encoded HMAC digest
3. **Algorithm**: HMAC-SHA256
4. **Secret**: your **Retell API key** (the one with the webhook badge)
5. **Signed content**: `raw_request_body + timestamp` (the timestamp string
   appended **after** the raw body)
6. **Encoding**: hexadecimal
7. **Replay window**: reject signatures whose timestamp is more than **5 minutes**
   from now

## Implementation

### SDK Verification (Python — recommended)

The Retell **Python SDK** exposes a verify helper on the client. It parses the
header, enforces the 5-minute timestamp window, and returns a boolean.

```python
import os
from retell import Retell

client = Retell(api_key=os.environ["RETELL_API_KEY"])

# raw_body is the raw request body as a string; signature is X-Retell-Signature
is_valid = client.verify(
    raw_body,
    api_key=os.environ["RETELL_API_KEY"],
    signature=signature,
)
```

### Manual Verification (Node / fallback)

The Retell **Node/TypeScript SDK does not provide a webhook verify helper**
(confirmed against `retell-sdk` 5.46.0 on npm — there is no `./webhooks` export
and no `verify` on the client), so Node handlers verify manually with the
built-in `crypto` module. This matches the Python SDK's algorithm exactly.

```javascript
const crypto = require('crypto');

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function verifyRetellSignature(rawBody, signatureHeader, apiKey) {
  // Header format: "v={unix_ms_timestamp},d={hex_digest}"
  const match = /^v=(\d+),d=(.*)$/.exec(signatureHeader || '');
  if (!match) return false;
  const [, timestamp, digest] = match;

  // Reject signatures older than 5 minutes (timestamp is in milliseconds)
  if (Math.abs(Date.now() - Number(timestamp)) > FIVE_MINUTES_MS) return false;

  // HMAC-SHA256 over the RAW body concatenated with the timestamp string
  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(rawBody + timestamp)
    .digest('hex');

  // Timing-safe comparison; guard against length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(digest));
  } catch {
    return false;
  }
}
```

### Manual Verification (Python, without the SDK)

If you can't add the SDK dependency:

```python
import hmac
import hashlib
import re
import time

FIVE_MINUTES_MS = 5 * 60 * 1000

def verify_retell_signature(raw_body: str, signature_header: str, api_key: str) -> bool:
    match = re.match(r"v=(\d+),d=(.*)", signature_header or "")
    if not match:
        return False
    timestamp, digest = match.group(1), match.group(2)

    if abs(int(time.time() * 1000) - int(timestamp)) > FIVE_MINUTES_MS:
        return False

    expected = hmac.new(
        api_key.encode(),
        (raw_body + timestamp).encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, digest)
```

## Common Gotchas

1. **Use the raw body, not re-serialized JSON**
   - Verify against the exact bytes Retell sent. Parsing to a dict and
     re-`JSON.stringify`/`json.dumps` changes whitespace and key order and
     breaks the signature.
   - Express: `express.raw({ type: 'application/json' })`
   - Next.js App Router: `await request.text()` (route handlers don't pre-parse)
   - FastAPI: `await request.body()`

2. **The secret is your API key**
   - There is no separate `whsec_` secret. Use the API key that has the webhook
     badge. Any other key will fail verification.

3. **Timestamp is in milliseconds**
   - The `v=` value is Unix **milliseconds**, not seconds. Compare against
     `Date.now()` (JS) or `time.time() * 1000` (Python).

4. **Order of concatenation**
   - Sign `body + timestamp`, not `timestamp + body`. Getting the order wrong
     produces a valid-looking but non-matching digest.

5. **Header casing**
   - Sent as `X-Retell-Signature`; most frameworks lowercase it to
     `x-retell-signature`. Read case-insensitively.

## Debugging Verification Failures

**Signature never matches**
- Confirm you're hashing the raw body (log `rawBody.length`).
- Confirm the secret is the webhook-badged API key with no extra whitespace.
- Confirm concatenation order is `body + timestamp`.

**Always rejected as expired**
- Check your server clock is synced (NTP).
- Confirm you're treating the timestamp as milliseconds.

**Works locally but not behind a proxy**
- A proxy/body parser may rewrite the payload. Ensure the raw bytes reach your
  verification code unchanged.

## Testing Tip

Generate a valid signature in tests using the same algorithm:

```javascript
function signBody(body, apiKey, timestamp = Date.now()) {
  const digest = crypto
    .createHmac('sha256', apiKey)
    .update(body + timestamp)
    .digest('hex');
  return `v=${timestamp},d=${digest}`;
}
```
