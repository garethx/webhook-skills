# How to Verify Synctera Webhook Signatures

## How It Works

Synctera uses a **custom HMAC scheme** — it is **not** Standard Webhooks (there is
no `webhook-id` / `webhook-timestamp` / `webhook-signature`). Each delivery
carries two headers:

| Header | Contents |
|--------|----------|
| `Synctera-Signature` | Hex-encoded HMAC signature (two `.`-delimited signatures during secret rotation) |
| `Request-Timestamp` | POSIX timestamp in **seconds** used in the signed string |

The signed string is:

```
{Request-Timestamp}.{raw_body}
```

The `.` is a **literal separator** between the timestamp and the raw request body.
The signature is:

```
HMAC-SHA256(secret, "{Request-Timestamp}.{raw_body}")  →  hex
```

- **Algorithm:** HMAC-SHA256
- **Encoding:** lowercase hex
- **Secret:** the value from `POST /v0/webhook_secrets` — **NOT your API key**

## Why Signature Verification Matters

Without verification, anyone who learns your endpoint URL can POST forged banking
events (fake transactions, account changes). Verifying the HMAC proves the request
came from Synctera and the body wasn't tampered with in transit.

## Implementation

There is **no npm/pip SDK** for Synctera webhook verification — the only official
client is Go (`github.com/synctera/client-libraries-go`). For Node.js and Python,
verify manually with the standard crypto libraries.

### Node.js (manual)

```javascript
const crypto = require('crypto');

function verifySynctera(rawBody, signatureHeader, timestamp, secret, toleranceSec = 300) {
  if (!signatureHeader || !/^\d+$/.test(String(timestamp))) return false;

  // Replay protection: Request-Timestamp within 5 minutes of now
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSec) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)   // "." is a literal separator
    .digest('hex');

  // Rolling secret: header can hold two "."-delimited signatures
  return signatureHeader.split('.').some((sig) => {
    try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
    catch { return false; }
  });
}
```

### Python (manual)

```python
import hmac, hashlib, time

def verify_synctera(raw_body: bytes, signature_header: str, timestamp: str,
                    secret: str, tolerance: int = 300) -> bool:
    if not signature_header or not timestamp.isdigit():
        return False

    # Replay protection: Request-Timestamp within 5 minutes of now
    if abs(int(time.time()) - int(timestamp)) > tolerance:
        return False

    signed = f"{timestamp}.".encode("utf-8") + raw_body  # "." is a literal separator
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()

    # Rolling secret: header can hold two "."-delimited signatures
    return any(hmac.compare_digest(sig, expected)
               for sig in signature_header.split("."))
```

## Common Gotchas

- **Verify the RAW body.** Compute the HMAC over the exact bytes received. If you
  `JSON.parse` and re-serialize first, whitespace/key-order differences break the
  signature.
- **The secret is not the API key.** Use the value from
  `POST /v0/webhook_secrets`. The API key only authorizes API calls.
- **The `.` is part of the signed string,** separating timestamp and body — it is
  *also* the delimiter between two signatures in the header during rotation. These
  are different `.`s; don't confuse them. Split the **header** on `.` for candidate
  signatures; keep the `.` in the **signed string**.
- **Timestamp is in seconds, not milliseconds.** Reject if `Request-Timestamp` is
  more than 5 minutes from now (replay protection).
- **Handle secret rotation.** During a rolling secret, `Synctera-Signature` may
  hold two signatures; accept the delivery if the body matches either.
- **Use a timing-safe comparison** (`crypto.timingSafeEqual` /
  `hmac.compare_digest`) and guard against length mismatches.
- **Respond within 5 seconds** with a 200, or Synctera retries.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always invalid | Using the API key instead of the `webhook_secrets` secret |
| Works sometimes, fails after rotation | Not checking both `.`-delimited signatures |
| Fails after adding logging/middleware | Body was parsed/re-serialized; verify the raw body |
| Intermittent failures | Comparing hex against raw bytes, or timestamp tolerance too tight |
| All requests rejected as stale | Treating `Request-Timestamp` as milliseconds instead of seconds |
