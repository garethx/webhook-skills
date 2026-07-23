# How to Verify Walmart Webhook Signatures

## Why Signature Verification Matters

Walmart performance webhooks arrive at a public HTTPS endpoint. Without verification, anyone who knows your URL could POST fake events. Verifying the `WM_SEC.SIGNATURE` HMAC-SHA256 signature proves the delivery came from Walmart and was not tampered with in transit.

## How It Works

Walmart does **not** HMAC the raw body directly. It builds a **canonical string** from four components, joined by newline (`\n`) characters, and HMACs that string:

```
<HTTP_METHOD>\n<REQUEST_PATH_AND_QUERY>\n<WM_SEC.TIMESTAMP>\n<SHA256_HEX_OF_RAW_BODY>
```

| Component | Value |
|-----------|-------|
| HTTP method | Uppercased request method (`POST`) |
| Path + query | Request path **including query string**, exactly as received |
| Timestamp | The `WM_SEC.TIMESTAMP` header (Unix epoch **seconds**) |
| Body hash | `SHA256(raw_body)` as **lowercase hex** |

Then:

```
signature = base64( HMAC_SHA256(secret, stringToSign) )
```

Compare it timing-safe against the `WM_SEC.SIGNATURE` header.

### Headers

| Header | Meaning |
|--------|---------|
| `WM_SEC.TIMESTAMP` | Unix epoch seconds when the event was created |
| `WM_SEC.SIGNATURE` | Base64 HMAC-SHA256 signature to compare against |
| `WM_SEC.KEY_ID` | Optional — identifies the active secret during rotation |

Header names are case-insensitive; frameworks typically lowercase them (`wm_sec.timestamp`, `wm_sec.signature`, `wm_sec.key_id`).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyWalmartWebhook({ method, pathWithQuery, timestamp, rawBody, signature, secret }) {
  if (!timestamp || !signature) return false;
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex'); // lowercase hex
  const stringToSign = [method.toUpperCase(), pathWithQuery, timestamp, bodyHash].join('\n');
  const expected = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // length mismatch = invalid
  }
}
```

- Express: get `pathWithQuery` from `req.originalUrl`, `rawBody` from `express.raw()`.
- Next.js: `const url = new URL(request.url); const pathWithQuery = url.pathname + url.search;` and `rawBody = await request.text();`

### Python

```python
import hmac, hashlib, base64

def verify_walmart_webhook(method, path_with_query, timestamp, raw_body, signature, secret):
    if not timestamp or not signature:
        return False
    body_hash = hashlib.sha256(raw_body).hexdigest()  # lowercase hex
    string_to_sign = "\n".join([method.upper(), path_with_query, timestamp, body_hash])
    expected = base64.b64encode(
        hmac.new(secret.encode(), string_to_sign.encode(), hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(signature, expected)
```

FastAPI: build `path_with_query` from `request.url.path` (append `?` + `request.url.query` when present) and pass `await request.body()` as `raw_body`.

## Common Gotchas

### 1. Hash the RAW body, not parsed JSON

The body hash must be `SHA256` of the exact bytes Walmart sent. If you parse JSON and re-serialize, key order and whitespace change and the hash won't match. Always capture the raw body **before** any JSON parsing.

```javascript
// WRONG — re-serialized body produces a different hash
app.use(express.json());
const bodyHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');

// CORRECT — raw bytes
app.post('/webhooks/walmart', express.raw({ type: '*/*' }), (req, res) => {
  const bodyHash = crypto.createHash('sha256').update(req.body).digest('hex');
});
```

### 2. Body hash is lowercase HEX; the signature is BASE64

Two different encodings in one algorithm. The body hash inside the canonical string is **lowercase hex**; the final HMAC output compared against `WM_SEC.SIGNATURE` is **base64**. Mixing these up is the most common failure.

### 3. Include the query string in the path component

The path component is the path **and** query string exactly as received (`/webhooks/walmart?foo=bar`), not just the path. Behind a proxy or tunnel, make sure the path you sign matches the path Walmart used.

### 4. Timestamp is in SECONDS

`WM_SEC.TIMESTAMP` is Unix epoch **seconds**, not milliseconds. Use it verbatim (as a string) inside the canonical string, and compare it against `now` in seconds for the replay check.

### 5. Timing-safe comparison

Always compare with a constant-time function (`crypto.timingSafeEqual` / `hmac.compare_digest`). Guard against length mismatches (wrap `timingSafeEqual` in try/catch, or check lengths first) so a bad-length signature returns `false` instead of throwing.

## Beyond the Signature

A valid signature is necessary but not sufficient. Also:

- **Enforce a replay window** — reject deliveries whose `WM_SEC.TIMESTAMP` is older than ~5 minutes (allow ~2 minutes of clock skew).
- **HTTPS/TLS 1.2+ only.**
- **Confirm the seller identity** in the payload (`sellerId`) is one you're authorized to process.
- **Dedupe by delivery/event id** for ~7 days to handle retries idempotently.
- **Return `2xx` only after a durable write**, within 3 seconds.

## Debugging Verification Failures

Log each canonical component and compare:

```javascript
console.log('method:', req.method.toUpperCase());
console.log('pathWithQuery:', req.originalUrl);
console.log('timestamp:', req.headers['wm_sec.timestamp']);
console.log('bodyHash:', crypto.createHash('sha256').update(req.body).digest('hex'));
console.log('expected:', expected);
console.log('received:', req.headers['wm_sec.signature']);
```

- **Signatures never match** → check body-hash encoding (lowercase hex) vs final encoding (base64), and confirm you're hashing the raw body.
- **Works locally, fails behind a tunnel** → the signed path/query differs from what your app sees. Sign the path Walmart actually requested.
- **Intermittent failures after a secret change** → use `WM_SEC.KEY_ID` to select the correct secret during rotation.

## Full Documentation

See [Security and authenticity](https://developer.walmart.com/us-marketplace/docs/security-and-authenticity) on the Walmart Developer Portal.
