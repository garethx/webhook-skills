# PayPro Global Signature Verification

## How It Works

PayPro Global IPN verification is **bespoke** — it is **not** an HMAC signature
in a header and **not** Standard Webhooks (`webhook-id` / `webhook-timestamp` /
`webhook-signature`). The verification material arrives as **fields in the
form-encoded body**, and there are **three independent layers**:

1. **IP allowlist** — requests originate only from fixed PayPro Global IPs.
2. **`SIGNATURE`** — a SHA256 hex hash over specific field values (primary check).
3. **`HASH`** — an MD5 hash of the order id and your secret key (legacy check).

> Verify as many layers as you can. `SIGNATURE` is the strongest because it
> covers the amount, status, email, and event name.

### Two different keys

| Layer | Key | Where |
|-------|-----|-------|
| `SIGNATURE` (SHA256) | **Validation Key** | Store Settings → General Settings → Integration |
| `HASH` (MD5) | **Secret Key** | Store Settings → General Settings → Integration |

Swapping these two keys is the single most common cause of verification
failures.

## SIGNATURE (SHA256) — primary

`SIGNATURE` is the SHA256 (hex) of **seven field values concatenated in this
exact order**, with no separators:

```
ORDER_ID + ORDER_STATUS + ORDER_TOTAL_AMOUNT + CUSTOMER_EMAIL + VALIDATION_KEY + TEST_MODE + IPN_TYPE_NAME
```

Example from PayPro Global's docs:

```
sha256("12345" + "Processed" + "9.99" + "test@payproglobal.com" + "qwerty" + "1" + "OrderCharged")
= sha256("12345Processed9.99test@payproglobal.comqwerty1OrderCharged")
```

The order — and especially the inclusion of `TEST_MODE` and `IPN_TYPE_NAME` at
the end — is easy to get wrong.

### Node (manual)

```javascript
const crypto = require('crypto');

function verifySignature(f, validationKey) {
  const base =
    `${f.ORDER_ID ?? ''}${f.ORDER_STATUS ?? ''}${f.ORDER_TOTAL_AMOUNT ?? ''}` +
    `${f.CUSTOMER_EMAIL ?? ''}${validationKey}${f.TEST_MODE ?? ''}${f.IPN_TYPE_NAME ?? ''}`;
  const expected = crypto.createHash('sha256').update(base, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(f.SIGNATURE ?? '').toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python (manual)

```python
import hashlib, hmac

def verify_signature(f: dict, validation_key: str) -> bool:
    base = (
        f"{f.get('ORDER_ID', '')}{f.get('ORDER_STATUS', '')}"
        f"{f.get('ORDER_TOTAL_AMOUNT', '')}{f.get('CUSTOMER_EMAIL', '')}"
        f"{validation_key}{f.get('TEST_MODE', '')}{f.get('IPN_TYPE_NAME', '')}"
    )
    expected = hashlib.sha256(base.encode("utf-8")).hexdigest()
    return hmac.compare_digest(expected, str(f.get("SIGNATURE", "")).lower())
```

## HASH (MD5) — legacy / secondary

`HASH` is:

- `MD5(ORDER_ID + SecretKey)` for **real** orders, or
- `MD5("1")` for **test** orders (`TEST_MODE=1`).

Example: `MD5("456346" + "wErt6HmQ")` = `MD5("456346wErt6HmQ")` =
`cdcca12c15a93df32818e463af053fbc`.

### Node (manual)

```javascript
function verifyHash(f, secretKey) {
  const isTest = String(f.TEST_MODE) === '1';
  const base = isTest ? '1' : `${f.ORDER_ID ?? ''}${secretKey}`;
  const expected = crypto.createHash('md5').update(base, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(f.HASH ?? '').toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

## IP Allowlist

Requests come only from these fixed addresses — enforce at the firewall/load
balancer, or in the handler as a defence-in-depth layer:

- IPv4: `198.199.123.239`, `157.230.8.40`
- IPv6: `2604:a880:400:d0::1843:7001`, `2604:a880:400:d1::b6c:c001`

## Common Gotchas

- **Form-encoded, not JSON.** Parse `application/x-www-form-urlencoded`. In
  Express use `express.urlencoded()`, in Next.js use `request.formData()`, in
  FastAPI use `await request.form()`.
- **The signature covers field values, not the raw body.** Unlike HMAC providers,
  you do not need the raw body — you recompute from the parsed field values. Do
  not URL-decode twice or re-encode; use the decoded field values as received.
- **Two keys.** `VALIDATION_KEY` for `SIGNATURE`, `SecretKey` for `HASH`. They
  are different values on the same dashboard tab.
- **Exact concatenation order for SIGNATURE.** `ORDER_ID`, `ORDER_STATUS`,
  `ORDER_TOTAL_AMOUNT`, `CUSTOMER_EMAIL`, `VALIDATION_KEY`, `TEST_MODE`,
  `IPN_TYPE_NAME`. Missing `TEST_MODE` or `IPN_TYPE_NAME`, or reordering, breaks
  the hash.
- **Test orders.** `TEST_MODE=1`, amounts are `0`, and `HASH` is `MD5("1")`.
  Handle this branch or test webhooks will fail HASH verification.
- **Hex case.** Hashes are hex; compare case-insensitively (normalize to
  lowercase) with a timing-safe comparison.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `SIGNATURE` never matches | Using `SecretKey` instead of `VALIDATION_KEY`, or wrong field order |
| `SIGNATURE` off by the last segment | Forgot to append `TEST_MODE` and/or `IPN_TYPE_NAME` |
| `HASH` fails only on test orders | Not branching to `MD5("1")` when `TEST_MODE=1` |
| Everything empty | Parsed body as JSON instead of form-urlencoded |
| Intermittent failures | Comparing with `===` on different-length strings, or case mismatch |
