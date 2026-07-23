# Persona Signature Verification

## How It Works

Persona signs every webhook with the `Persona-Signature` header. The scheme is
**Stripe-style** — it does **NOT** follow the Standard Webhooks spec (there are no
`webhook-id` / `webhook-timestamp` / `webhook-signature` headers).

| Property | Value |
|----------|-------|
| Header name | `Persona-Signature` (HTTP headers are case-insensitive; frameworks lowercase to `persona-signature`) |
| Algorithm | HMAC-SHA256 |
| Encoding | hex |
| Header format | `t=<unix_seconds>,v1=<hex_signature>` |
| Signed content | `` `${t}.${rawBody}` `` — the timestamp, a literal dot, then the raw request body |
| Secret | Per-webhook, prefixed `wbhsec_`, revealed in Dashboard → Webhooks |
| Timestamp tolerance | **None documented** — replay checking is up to you |

To verify: for each `t=...,v1=...` pair, compute `HMAC-SHA256(secret, "{t}.{rawBody}")`
as hex and compare it (timing-safe) against that pair's `v1`.

## Secret Rotation — Two Signatures

During secret rotation Persona signs with both the old and new secret, and the
header carries **two space-separated pairs**:

```
Persona-Signature: t=1721649600,v1=<hex_signed_with_old> t=1721649600,v1=<hex_signed_with_new>
```

You hold **one** secret at a time. Compute your HMAC against **each** pair and
accept if **any** `v1` matches. This is why the verifier splits on whitespace first,
then on commas.

## Implementation

Persona has **no official server-side SDK** (`npm persona` is the frontend embedded
inquiry SDK, not a webhook verifier), so verify manually in every language.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyPersonaSignature(rawBody, header, secret) {
  if (!header) return false;
  return header.trim().split(/\s+/).some((pair) => {
    const parts = pair.split(',');
    const t = parts.find((p) => p.startsWith('t='))?.slice(2);
    const v1 = parts.find((p) => p.startsWith('v1='))?.slice(3);
    if (!t || !v1) return false;
    const expected = crypto.createHmac('sha256', secret)
      .update(`${t}.${rawBody}`).digest('hex');
    const a = Buffer.from(v1, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

### Python (FastAPI)

```python
import hashlib
import hmac

def verify_persona_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header:
        return False
    body_str = raw_body.decode("utf-8")
    for pair in header.split():  # splits on whitespace -> rotation pairs
        parts = dict(p.split("=", 1) for p in pair.split(",") if "=" in p)
        t, v1 = parts.get("t"), parts.get("v1")
        if not t or not v1:
            continue
        expected = hmac.new(
            secret.encode("utf-8"),
            f"{t}.{body_str}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if hmac.compare_digest(v1, expected):
            return True
    return False
```

## Optional: Replay Protection

Persona documents **no** timestamp tolerance, so the examples do not reject on the
timestamp — a valid signature is accepted regardless of `t`'s age. If your threat
model needs replay protection, add your own window using the `t` value, e.g. reject
when `abs(now_seconds - int(t)) > 300`. Note `t` is in **seconds** (Unix epoch), not
milliseconds. Persist processed `data.id`s for stronger protection.

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes Persona sent. Any
  re-serialization (`JSON.parse` → `JSON.stringify`) changes whitespace/key order and
  breaks the HMAC. In Express use `express.raw()`; in Next.js App Router use
  `await request.text()`; in FastAPI use `await request.body()`.
- **Seconds, not milliseconds.** `t` is Unix seconds. (Contrast with Knock, which
  uses milliseconds — a copied verifier will silently misbehave if you add a replay
  window.)
- **hex, not base64.** `v1` is a hex digest. Decode/compare as hex.
- **Two pairs during rotation.** Split on whitespace before commas, and accept if any
  pair matches. A verifier that reads only the first pair will fail intermittently
  mid-rotation.
- **Not Standard Webhooks.** Don't reach for a Standard Webhooks / Svix library — the
  header name and format differ.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`, and
  guard against buffer length mismatches (a non-hex `v1` decodes to a short buffer).

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always invalid | Body was parsed/re-serialized before verifying — use the raw body |
| Always invalid | Comparing base64 instead of hex, or wrong secret (must be the `wbhsec_` for *this* webhook) |
| Intermittent failures | Secret rotation in progress — you're only checking the first `t=,v1=` pair |
| `Malformed` errors | Header split on the wrong delimiter — split whitespace → pairs, then commas → keys |
| Length/`RangeError` on compare | `v1` isn't valid hex; check buffer lengths before `timingSafeEqual` |
