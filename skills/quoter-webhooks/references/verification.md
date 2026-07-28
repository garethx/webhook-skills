# How to Verify Quoter Webhook Signatures

## Why Signature Verification Matters

A webhook endpoint is a public URL. Without verification, anyone can POST fake "quote accepted" or "payment received" events to your app. Quoter's verification is a **weak MD5 shared-secret hash** — better than nothing, but you must combine it with the safeguards below.

## How It Works

Quoter POSTs `application/x-www-form-urlencoded` with three fields:

| Field | Meaning |
|-------|---------|
| `hash` | `md5(HASH_KEY + timestamp + data)` in lowercase hex |
| `timestamp` | GMT UNIX timestamp (seconds) at send time |
| `data` | The payload as a JSON (or XML) **string** |

To verify:

1. Read the `timestamp` and `data` form fields.
2. Compute `md5(HASH_KEY + timestamp + data)`.
3. Compare (timing-safe) against the `hash` field.
4. Reject if `now - timestamp > 300` seconds (5 minutes) to limit replay.

The original documented reference implementation (PHP):

```php
if ( md5('HASH_KEY'.$_POST['timestamp'].$_POST['data']) == $_POST['hash'] ) {
  if ( (int)gmdate('U') - (int)$_POST['timestamp'] <= 300 ) {
    // Request is valid
  }
}
```

## This Is NOT Standard Webhooks or HMAC

- **No `webhook-id` / `webhook-timestamp` / `webhook-signature` headers.** The signature is a **form field** named `hash`.
- **No HMAC-SHA256.** It is a plain **MD5** of `key + timestamp + data` concatenated.
- **The hash key is optional.** If it is blank in Quoter, the `hash` provides no security. Always set one.

There is **no official Quoter SDK**, so every implementation below verifies **manually**.

## Implementation

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyQuoter(hashKey, timestamp, data, receivedHash) {
  const expected = crypto
    .createHash('md5')
    .update(hashKey + timestamp + data)
    .digest('hex');

  const fresh = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) <= 300;
  try {
    return fresh && crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(receivedHash || '')
    );
  } catch {
    return false; // buffer length mismatch = invalid
  }
}
```

### Python (FastAPI)

```python
import hashlib, hmac, time

def verify_quoter(hash_key: str, timestamp: str, data: str, received_hash: str) -> bool:
    expected = hashlib.md5(f"{hash_key}{timestamp}{data}".encode("utf-8")).hexdigest()
    fresh = abs(int(time.time()) - int(timestamp)) <= 300
    return fresh and hmac.compare_digest(expected, received_hash or "")
```

## Common Gotchas

- **Hash the `data` string exactly as received.** After URL-decoding the form body, use the decoded `data` string as-is. **Do not** `JSON.parse` it and re-`JSON.stringify` — key order and whitespace will change and the MD5 will not match.
- **Concatenation order is `HASH_KEY + timestamp + data`.** No separators, no delimiters.
- **It's a form field, not a header.** Don't look for `X-Quoter-Signature`; read `req.body.hash` (Express), `formData.get('hash')` (Next.js), or `form["hash"]` (FastAPI).
- **Content-Type is `application/x-www-form-urlencoded`.** Use your framework's form parser, not a JSON body parser, to read `hash` / `timestamp` / `data`.
- **Empty hash key = no security.** If `QUOTER_HASH_KEY` is unset, treat the request as unverifiable and reject (these examples return `400 Invalid signature` rather than trusting it).
- **MD5 is broken.** Use a timing-safe comparison and add a network-level control (IP allowlist, secret path token, or Hookdeck).
- **Timestamp is GMT UNIX seconds.** Compare against `time.time()` / `Date.now()/1000` in UTC; the 5-minute window limits replay.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|-------------|
| Hash never matches | You re-serialized `data` (e.g. parsed then stringified) instead of hashing the raw string. |
| Hash never matches | Wrong concatenation order or extra separators — it must be `key + timestamp + data`. |
| Hash never matches | Wrong Hash Key, or the key is blank in Quoter but set in your app (or vice versa). |
| `hash` / `data` are `undefined` | You're using a JSON body parser. Switch to a form (urlencoded) parser. |
| Valid requests rejected | Clock skew pushing `now - timestamp` past 300s, or the timestamp isn't being read as seconds. |
| `timingSafeEqual` throws | Received hash is empty or a different length — wrap in try/catch and return `false`. |
