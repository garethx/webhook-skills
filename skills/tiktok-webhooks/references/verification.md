# How to Verify TikTok Webhook Signatures

## Why Signature Verification Matters

Your callback URL is public. Without verification, anyone who learns it can POST
fake `authorization.removed` or `video.publish.completed` events. Verifying the
`TikTok-Signature` header proves the request came from TikTok and was not
tampered with in transit.

## How It Works

TikTok signs each delivery with your app's **client secret** using HMAC-SHA256.

- **Header:** `TikTok-Signature` (some docs render it `Tiktok-Signature` —
  header names are case-insensitive, so match case-insensitively).
- **Header value format:** `t=<unix_timestamp>,s=<signature>`, e.g.
  `t=1633174587,s=18494715036ac4416a1d0a673871a2edbcfc94d94bd88ccd2c5ec9b3425afe66`
- **Algorithm:** HMAC-SHA256, **hex**-encoded.
- **Signed payload:** the timestamp, a literal `.`, then the **raw request body**:
  `"<t>" + "." + raw_body`
- **Key:** your app's **client secret** (`TIKTOK_CLIENT_SECRET`).

This is **not** the Standard Webhooks spec (no `webhook-id` / `webhook-timestamp`
/ `webhook-signature` headers), though the timestamped-HMAC shape is similar.

## Verification Steps

1. Read the `TikTok-Signature` header and split it into `t` and `s` (split on
   `,`, then on `=`).
2. Reject the request if the timestamp `t` is too old (replay protection — see
   below).
3. Recompute `HMAC-SHA256(client_secret, "<t>.<raw_body>")` and hex-encode it.
4. Compare your value to `s` using a **timing-safe** comparison.
5. Only after the signature matches, parse the JSON body.

## Implementation

TikTok publishes **no webhook SDK**, so every framework verifies manually.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyTikTokWebhook(rawBody, header, clientSecret, toleranceSec = 300) {
  if (!header || !clientSecret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  const { t, s } = parts;
  if (!t || !s) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > toleranceSec) return false;

  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(`${t}.${raw}`, 'utf8')
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(s, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
```

### Python (FastAPI)

```python
import hmac
import hashlib
import time


def verify_tiktok_webhook(raw_body: bytes, header: str, client_secret: str,
                          tolerance_sec: int = 300) -> bool:
    if not header or not client_secret:
        return False
    parts = dict(kv.split("=", 1) for kv in header.split(",") if "=" in kv)
    t, s = parts.get("t"), parts.get("s")
    if not t or not s:
        return False

    try:
        age = abs(int(time.time()) - int(t))
    except ValueError:
        return False
    if age > tolerance_sec:
        return False

    signed = f"{t}.".encode("utf-8") + raw_body
    expected = hmac.new(client_secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, s)
```

## Replay Protection

The timestamp `t` is part of the signed payload, so an attacker cannot change it
without invalidating `s`. But a valid old request could still be **replayed**.
TikTok does **not document an explicit tolerance window**, so reject deliveries
whose timestamp is more than a few minutes old — these examples default to **300
seconds (5 minutes)**. Combine this with idempotency to dedupe legitimate retries.

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes received. Re-serializing
  parsed JSON reorders/whitespaces keys and breaks the HMAC. In Express, use
  `express.raw()`; in Next.js, `await request.text()`; in FastAPI,
  `await request.body()`.
- **Hex, not base64.** TikTok's signature is lowercase hex. Decoding it as base64
  will never match.
- **Sign `"<t>.<raw_body>"`, not just the body.** The timestamp and the literal
  `.` are part of the signed string.
- **The key is the client secret**, not a dedicated webhook secret.
- **`content` is a JSON string.** After verifying, parse the envelope, then
  `JSON.parse(payload.content)` separately.
- **Header casing.** Frameworks lowercase header names; read `tiktok-signature`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Verifying parsed/re-serialized JSON instead of the raw body |
| Signature never matches | Decoding as base64 instead of hex, or forgetting `"<t>."` prefix |
| Works locally, fails in prod | A proxy/body parser mutated the body before your handler |
| Intermittent 401s on old events | Timestamp older than your tolerance window (expected — those are stale/replayed) |
| `500` errors | `client_secret` not set — fail closed (return false) instead of calling HMAC with `undefined` |
