# How to Verify Sanity Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Signature verification proves a request
genuinely came from Sanity (and wasn't forged or tampered with) before you act
on it. Always verify **before** parsing or processing the body.

## How Sanity's Signature Works

Sanity uses the official [`@sanity/webhook`](https://github.com/sanity-io/webhook-toolkit)
toolkit. The scheme is Stripe-style but **not** Standard Webhooks compliant:

| Aspect | Value |
|--------|-------|
| Header | `sanity-webhook-signature` (constant `SIGNATURE_HEADER_NAME`) |
| Header format | `t=<timestamp>,v1=<signature>` |
| Timestamp | Unix time in **milliseconds** |
| Algorithm | HMAC-SHA256 |
| Signed content | `` `${timestamp}.${rawBody}` `` |
| Encoding | **base64url**, no padding (`+`→`-`, `/`→`_`, `=` stripped) |
| Secret | The string you set on the webhook at sanity.io/manage |

The verifier extracts the timestamp from the `t=` field, recomputes the HMAC over
`` `${timestamp}.${rawBody}` ``, base64url-encodes it, and compares it to `v1=`.
There is **no timestamp tolerance window** — the timestamp is only used as part
of the signed content (it must be a number ≥ `1609459200000`, i.e. 2021-01-01).

> **Note:** the millisecond unit and the `1609459200000` floor are confirmed
> from the official [`@sanity/webhook`](https://github.com/sanity-io/webhook-toolkit)
> source, not from Sanity's own docs (which don't specify the wire format) —
> if you add your own replay-window check, treat `t=` as milliseconds.

## Implementation

### SDK Verification (Node.js — Express & Next.js)

`isValidSignature` is **async** in v4+ (Node 18+) and returns a boolean; it never
throws on a bad signature. Always pass the **raw** body string.

```javascript
const { isValidSignature, SIGNATURE_HEADER_NAME } = require('@sanity/webhook');

const signature = req.headers[SIGNATURE_HEADER_NAME]; // 'sanity-webhook-signature'
const valid = await isValidSignature(rawBody, signature, process.env.SANITY_WEBHOOK_SECRET);
if (!valid) return res.status(400).send('Invalid signature');
```

The toolkit also ships an Express middleware if you prefer it:

```javascript
const { requireSignedRequest } = require('@sanity/webhook');

app.use(express.text({ type: 'application/json' }));
app.post('/webhooks/sanity',
  requireSignedRequest({ secret: process.env.SANITY_WEBHOOK_SECRET }), // parses body on success
  handler,
);
```

`requireSignedRequest` responds automatically on failure (`respondOnError: true`
by default) and, with `parseBody: true` (default), replaces `req.body` with the
parsed JSON. The examples in this skill use `isValidSignature` directly so the
status codes and event dispatch are explicit and easy to test.

### Manual Verification (fallback — Python / FastAPI)

There is no official Python package, so replicate the algorithm:

```python
import base64, hashlib, hmac, re

SIGNATURE_HEADER = "sanity-webhook-signature"
_SIG_RE = re.compile(r"^t=(\d+)[, ]+v1=([^, ]+)$")

def is_valid_signature(raw_body: str, signature_header: str, secret: str) -> bool:
    match = _SIG_RE.match(signature_header or "")
    if not match:
        return False
    timestamp, provided = match.group(1), match.group(2)
    signed_payload = f"{timestamp}.{raw_body}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).digest()
    expected = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")  # base64url, no padding
    return hmac.compare_digest(expected, provided)  # timing-safe
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes received. If you
  `JSON.parse` (or re-serialize) first, the HMAC won't match. In Express use
  `express.text({ type: 'application/json' })`; in Next.js use `await req.text()`;
  in FastAPI use `await request.body()`.
- **Timestamp is in milliseconds**, not seconds. Signing with a seconds-based
  timestamp produces a valid-looking but wrong signature.
- **Encoding is base64url without padding** — not hex, not standard base64.
  Node's `.digest('base64url')` and Python's `urlsafe_b64encode(...).rstrip('=')`
  both produce the correct form.
- **`isValidSignature` is async** in v4 — you must `await` it. Forgetting `await`
  makes the truthy Promise pass every request.
- **Header name is lowercase** `sanity-webhook-signature`. HTTP headers are
  case-insensitive; use `SIGNATURE_HEADER_NAME` from the SDK to be safe.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Body was parsed/re-stringified before verifying — use the raw body |
| Always invalid | Timestamp signed in seconds instead of milliseconds |
| Always invalid | Wrong encoding (hex or standard base64 instead of base64url) |
| Every request "passes" | Missing `await` on `isValidSignature` (Promise is truthy) |
| Missing header | Secret not set on the webhook at sanity.io/manage |
