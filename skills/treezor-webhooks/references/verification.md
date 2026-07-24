# How to Verify Treezor Webhook Signatures

## Why Signature Verification Matters

Treezor webhooks carry sensitive banking events. Verifying the signature proves the
request genuinely came from Treezor and was not tampered with in transit. Never act on
an unverified webhook.

## How Treezor's Signature Scheme Works

Treezor uses a **custom HMAC-SHA256 scheme** — it is **not** the Standard Webhooks
(Svix) spec, and there is **no signature HTTP header**. Instead, each JSON body
contains two related fields:

- `object_payload` — the object's data
- `object_payload_signature` — the base64 HMAC-SHA256 of that payload

The signature is computed over a **canonical serialization** of `object_payload`, not
over the raw request body. The canonical form matches PHP's default `json_encode`
output:

1. **Compact separators** — no spaces (`{"a":1,"b":2}`, not `{"a": 1, "b": 2}`)
2. **Forward slashes escaped** — `/` becomes `\/`
3. **Non-ASCII escaped** — every character above U+007F becomes a lowercase
   `\uXXXX` escape (e.g. `é` → `é`)
4. **Key order preserved** — the order keys appear in the received JSON

Then: `base64( HMAC-SHA256( webhook_secret, canonical_string ) )`, compared timing-safe
against `object_payload_signature`.

## Security: Only `object_payload` Is Signed

`object_payload_signature` covers **`object_payload` and nothing else**. Every other
field in the envelope — `webhook` (the event name), `webhook_id`, `object`,
`object_id`, `webhook_created_at` — sits **outside the signed region**. A successful
verification tells you the `object_payload` is authentic; it says nothing about the
envelope around it.

An attacker who replays a genuine delivery can rewrite those envelope fields freely
and the signature will still check out. So:

- **Treat the envelope as untrusted metadata.** Fine for logging, correlation, and
  routing hints; never the basis of a money-moving or state-changing decision.
- **Derive business state from the verified `object_payload`.** Read the resource id,
  amounts, statuses, and user/wallet references out of `object_payload`, not out of
  `object_id` or `webhook`.
- **Cross-check before acting.** If you dispatch on `event.webhook`, confirm the
  handler's assumptions hold against `object_payload` (e.g. that the payload really
  does look like a card transaction) before mutating anything.
- **Re-fetch when the stakes are high.** For balance or KYC-gated flows, use the
  verified id from `object_payload` to re-read the object from Treezor's API.

The same applies to `webhook_id` dedupe keys: they are useful for idempotency but are
not authenticated, so they must not be the only guard on a non-idempotent action.

## Implementation

There is no official Treezor SDK for webhook verification, so verify manually in every
language. The examples in this skill ([express](../examples/express/),
[nextjs](../examples/nextjs/), [fastapi](../examples/fastapi/)) all use the same
algorithm.

### Node.js

```javascript
const crypto = require('crypto');

function canonicalize(objectPayload) {
  return JSON.stringify(objectPayload)
    .replace(/\//g, '\\/')                       // escape forward slashes
    .replace(/[\u0080-\uffff]/g, (ch) =>         // escape non-ASCII to \uXXXX
      '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}

function verify(objectPayload, receivedSignature, secret) {
  if (!receivedSignature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(canonicalize(objectPayload), 'utf8')
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature),
      Buffer.from(expected)
    );
  } catch {
    return false; // different lengths = invalid
  }
}
```

### Python

```python
import hmac, hashlib, base64, json

def canonicalize(object_payload) -> str:
    # ensure_ascii=True -> non-ASCII becomes \uXXXX; compact separators; escape slashes
    return json.dumps(
        object_payload, ensure_ascii=True, separators=(",", ":")
    ).replace("/", "\\/")

def verify(object_payload, received_signature: str, secret: str) -> bool:
    if not received_signature:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode(), canonicalize(object_payload).encode(), hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(received_signature, expected)
```

### PHP (reference — matches Treezor's own docs)

```php
$expected = base64_encode(
    hash_hmac('sha256', json_encode($object_payload), $secret, true)
);
```

PHP's `json_encode` already produces the compact, slash-escaped, `\uXXXX` form, which
is why the Node and Python code above re-create it explicitly.

## Common Gotchas

- **The signature is over `object_payload`, not the raw body.** You must parse the body
  first, then re-serialize `object_payload` canonically. This is the opposite of most
  providers (Stripe, Shopify) that sign the raw body.
- **`text/plain` MIME type.** Treezor sends `Content-Type: text/plain`. Framework JSON
  body parsers (which key off `application/json`) will skip it — read the raw text and
  `JSON.parse` it yourself.
- **Slash escaping is required.** Forgetting `/` → `\/` is the most common cause of
  mismatches for payloads containing URLs, dates, or IBANs with slashes.
- **`\uXXXX` casing.** Treezor/PHP use lowercase hex. `toString(16)` (JS) and
  `json.dumps` (Python) both produce lowercase — don't upper-case it.
- **Compact separators.** Python's `json.dumps` adds spaces by default; you must pass
  `separators=(",", ":")`.
- **Key order.** Re-serialize the parsed object as-is; do not sort keys. Parsing then
  stringifying preserves the received order in both Node and Python.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`, and
  guard against length-mismatch exceptions.
- **Only `object_payload` is signed.** `webhook`, `webhook_id`, `object` and
  `object_id` are unauthenticated envelope fields — see the security note above.
- **The canonical form is derived from PHP's `json_encode` behavior.** It is exactly
  true for strings and integers; other types (notably non-string floats, where PHP's
  serialization precision may differ from JavaScript's or Python's) could canonicalize
  differently across languages. Worth confirming against a live delivery that contains
  such a value before you rely on it in production.

## How to Debug Verification Failures

1. **Log the two strings.** Print your `canonicalize(object_payload)` output and the
   computed base64 signature next to the received `object_payload_signature`.
2. **Diff the canonical string** against a byte-accurate `json_encode` of the same
   payload. Look for missing slash escapes, spaces after `:`/`,`, or un-escaped
   accented characters.
3. **Confirm the environment secret.** Sandbox and Production use different
   `webhook_secret` values.
4. **Check you parsed, not double-encoded.** `object_payload` should be the parsed
   object; passing the already-stringified value into `JSON.stringify` double-encodes it.
5. **Return 5xx on failure while debugging** so Treezor retries and you get more
   samples — but never process an unverified webhook.
