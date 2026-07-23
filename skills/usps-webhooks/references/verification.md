# How to Verify USPS Webhook Signatures

## Why Signature Verification Matters

Delivered USPS notifications carry **no** OAuth token — the token is only used to
*create* subscriptions. Anyone who discovers your `listenerURL` could POST fake
tracking events unless you verify each request. USPS provides an **optional**
HMAC signature (and/or IP allowlisting) for this. Always set a `secret` and
verify the `X-HMAC` header.

## How It Works

When you create the subscription with a 32-character `secret`, USPS signs each
notification and sends the signature in a header:

- **Header:** `X-HMAC` (deprecated alias: `hmac-header`) — read `X-HMAC` first,
  fall back to `hmac-header`.
- **Algorithm:** HMAC-SHA256.
- **Encoding:** Base64.
- **Signed content:** `timestamp + payload` — the envelope's `timestamp` field
  concatenated (no separator) with the **raw, stringified** `payload` field.

```
X-HMAC = Base64( HMAC-SHA256( secret, timestamp + payload ) )
```

Because the signed content is built from two envelope **fields**, you must parse
the outer envelope JSON to read them. Critically, the inner `payload` is itself a
JSON **string** — use it exactly as received. Do **not** `JSON.parse()` and
re-`stringify()` it before verifying; re-serialization can reorder keys or change
whitespace and will break the signature.

## Implementation

USPS publishes no official SDK for webhook verification, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyUspsSignature(timestamp, payload, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false; // nothing to verify against
  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + payload) // raw stringified payload, unmodified
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected));
  } catch {
    return false; // buffer length mismatch = invalid
  }
}

// In your handler:
const rawBody = req.body.toString('utf8');      // raw envelope
const envelope = JSON.parse(rawBody);            // parse to read fields
const hmacHeader = req.headers['x-hmac'] || req.headers['hmac-header'];
const ok = verifyUspsSignature(
  envelope.timestamp,
  envelope.payload,
  hmacHeader,
  process.env.USPS_WEBHOOK_SECRET
);
```

### Python

```python
import hmac, hashlib, base64, json

def verify_usps_signature(timestamp: str, payload: str, hmac_header: str, secret: str) -> bool:
    if not hmac_header or not secret:  # nothing to verify against
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode(), (timestamp + payload).encode(), hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(hmac_header, expected)

# In your handler:
raw_body = await request.body()
envelope = json.loads(raw_body)
hmac_header = request.headers.get("x-hmac") or request.headers.get("hmac-header")
ok = verify_usps_signature(
    envelope["timestamp"],
    envelope["payload"],
    hmac_header,
    os.environ.get("USPS_WEBHOOK_SECRET"),  # may be None - see the branch below
)
```

## What the Examples Do When No Secret Is Configured

USPS only signs notifications when the subscription was created with a 32-char
`secret`. Without one, **no `X-HMAC` header is sent at all** — there is nothing
to verify, and a handler that blindly calls `createHmac('sha256', undefined)` /
`secret.encode()` crashes with an opaque 500.

The examples in this skill therefore take an **explicit, documented branch**:

- **`USPS_WEBHOOK_SECRET` set** → verify `X-HMAC` (or the `hmac-header` alias)
  over `timestamp + payload`; reject with `400` on mismatch or a missing header.
- **`USPS_WEBHOOK_SECRET` unset** → log a **one-time warning** stating that
  notifications are being processed with no per-message verification and that
  IP allowlisting should be used instead, then process the delivery.

This mirrors how USPS actually behaves rather than failing closed on a
configuration USPS considers valid. It is a deliberate trade-off: an unverified
endpoint accepts anything that reaches it. If your deployment cannot rely on an
IP allowlist, change that branch to reject the request instead — the point is
that the choice is visible in the code, not an accident.

Set a `secret` whenever you can. Treat the unset case as a development or
IP-restricted-network mode.

## IP Allowlisting (alternative / defense in depth)

IP allowlisting is the other option USPS offers, either instead of the HMAC
signature or alongside it: restrict inbound traffic to the USPS source IP ranges
at your firewall or load balancer. It is the only verification available if you
did **not** set a `secret`.

USPS does not publish those ranges in the Subscriptions API documentation, and
no authoritative list was confirmed for this skill. **Obtain the current ranges
from USPS directly** (your API onboarding contact or developer support) and
re-check them periodically — do not copy IP ranges from third-party blog posts,
and do not assume a stable published list exists.

## Common Gotchas

- **Sign `timestamp + payload`, not the raw body.** The signature is over the two
  envelope *fields* concatenated, not over the whole envelope JSON.
- **Do not re-serialize the payload.** Read the `payload` string from the parsed
  envelope and use it verbatim. Re-`stringify()`-ing the parsed tracking object
  will change bytes and break verification.
- **Base64, not hex.** The digest is Base64-encoded (like Shopify), not hex.
- **Header casing.** Node/Express and FastAPI lowercase header names, so read
  `x-hmac` (and `hmac-header`). USPS documents the header as `X-HMAC`.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`
  and guard against buffer-length mismatches.
- **No secret = no verification.** If the subscription has no `secret` and you
  have no IP allowlist, there is nothing to verify — set a `secret`. Do not let
  the missing secret reach `createHmac` / `hmac.new`; branch on it explicitly
  (see above) so you get a clear warning instead of a `TypeError`/500.

## Debugging Verification Failures

- **Always 400?** Log the received `X-HMAC` and your computed digest. If lengths
  differ, you are probably hashing the wrong content (e.g. the raw body instead
  of `timestamp + payload`).
- **Intermittent failures?** Confirm you are not mutating `payload` (parsing +
  re-stringifying) anywhere before verification.
- **Header missing?** Confirm the subscription was created **with** a `secret`;
  without one USPS sends no `X-HMAC` header.
- **Wrong secret?** The `secret` must be the exact 32-character string you set on
  the subscription, stored as `USPS_WEBHOOK_SECRET`.
