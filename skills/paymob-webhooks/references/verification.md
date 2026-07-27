# How to Verify Paymob Webhook Signatures

## Why Signature Verification Matters

Your callback endpoint is public. Without verification, anyone could POST a fake
"payment succeeded" body and trick you into fulfilling an order. Paymob signs
every callback with an HMAC so you can prove it came from Paymob and was not
tampered with.

## How Paymob's HMAC Scheme Works

Paymob is **not** Standard Webhooks, and it does **not** sign the raw request
body. Instead:

1. Paymob selects **20 specific fields** from the transaction.
2. It concatenates their **string values in a fixed order**, with **no
   separators**.
3. It computes **HMAC-SHA512** of that string using your account **HMAC secret**.
4. It **hex-encodes** the digest and sends it as the **`hmac` query parameter**
   (`?hmac=<hex>`). There is **no signature header**.

You recompute the same value and compare (timing-safe) against the `hmac` param.

### The 20 Fields, In Order

| # | POST key (Transaction Processed) | GET key (Transaction Response) |
|---|----------------------------------|--------------------------------|
| 1 | `obj.amount_cents` | `amount_cents` |
| 2 | `obj.created_at` | `created_at` |
| 3 | `obj.currency` | `currency` |
| 4 | `obj.error_occured` | `error_occured` |
| 5 | `obj.has_parent_transaction` | `has_parent_transaction` |
| 6 | `obj.id` | `id` |
| 7 | `obj.integration_id` | `integration_id` |
| 8 | `obj.is_3d_secure` | `is_3d_secure` |
| 9 | `obj.is_auth` | `is_auth` |
| 10 | `obj.is_capture` | `is_capture` |
| 11 | `obj.is_refunded` | `is_refunded` |
| 12 | `obj.is_standalone_payment` | `is_standalone_payment` |
| 13 | `obj.is_voided` | `is_voided` |
| 14 | `obj.order.id` | `order_id` |
| 15 | `obj.owner` | `owner` |
| 16 | `obj.pending` | `pending` |
| 17 | `obj.source_data.pan` | `source_data_pan` |
| 18 | `obj.source_data.sub_type` | `source_data_sub_type` |
| 19 | `obj.source_data.type` | `source_data_type` |
| 20 | `obj.success` | `success` |

The order is identical for both callbacks — only the key paths differ (nested for
POST, flattened for GET).

## Implementation

There is no first-party Node/Python Paymob SDK with a ready-made webhook
verifier — the published `paymob` packages are minimal WIP helpers — so verify
manually with the standard crypto library.

### Node.js (Transaction Processed Callback / POST)

```javascript
const crypto = require('crypto');

function verifyPaymobHmac(obj, hmacParam, secret) {
  const s = obj.source_data || {};
  const signed = [
    obj.amount_cents, obj.created_at, obj.currency, obj.error_occured,
    obj.has_parent_transaction, obj.id, obj.integration_id, obj.is_3d_secure,
    obj.is_auth, obj.is_capture, obj.is_refunded, obj.is_standalone_payment,
    obj.is_voided, obj.order.id, obj.owner, obj.pending,
    s.pan, s.sub_type, s.type, obj.success,
  ].join(''); // Array.join renders booleans as "true"/"false", numbers as digits
  const expected = crypto.createHmac('sha512', secret).update(signed).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacParam || ''));
  } catch {
    return false; // length mismatch → invalid
  }
}
```

### Python (FastAPI / manual)

```python
import hmac, hashlib

def _v(x):
    # JSON booleans serialise to lowercase "true"/"false"
    return "true" if x is True else "false" if x is False else str(x)

def verify_paymob_hmac(obj: dict, hmac_param: str, secret: str) -> bool:
    s = obj.get("source_data") or {}
    signed = "".join(_v(x) for x in [
        obj["amount_cents"], obj["created_at"], obj["currency"], obj["error_occured"],
        obj["has_parent_transaction"], obj["id"], obj["integration_id"], obj["is_3d_secure"],
        obj["is_auth"], obj["is_capture"], obj["is_refunded"], obj["is_standalone_payment"],
        obj["is_voided"], obj["order"]["id"], obj["owner"], obj["pending"],
        s.get("pan"), s.get("sub_type"), s.get("type"), obj["success"],
    ])
    expected = hmac.new(secret.encode(), signed.encode(), hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, hmac_param or "")
```

### Verifying the GET (Transaction Response) Callback

Read the same 20 fields from the query string in the same order. The values are
already strings (`"true"`/`"false"` for booleans), so concatenate them directly:

```javascript
const q = req.query; // Express
const signed = [
  q.amount_cents, q.created_at, q.currency, q.error_occured,
  q.has_parent_transaction, q.id, q.integration_id, q.is_3d_secure,
  q.is_auth, q.is_capture, q.is_refunded, q.is_standalone_payment,
  q.is_voided, q.order_id, q.owner, q.pending,
  q.source_data_pan, q.source_data_sub_type, q.source_data_type, q.success,
].join('');
const expected = crypto.createHmac('sha512', secret).update(signed).digest('hex');
```

## Common Gotchas

- **SHA512, not SHA256.** Using SHA256 produces a 64-char hex digest that will
  never match Paymob's 128-char digest.
- **Hex, not base64.** Paymob hex-encodes the digest.
- **The signature is a query parameter (`?hmac=`), not a header.** Read it from
  the URL query string.
- **Exact field order matters.** The 20 fields must be concatenated in the order
  above. Any reordering breaks the match.
- **No separators.** Values are joined with an empty string, not commas or `.`.
- **Booleans must be lowercase `true`/`false`.** JavaScript `Array.join` and JSON
  already produce these; in Python, `str(True)` gives `"True"` — convert
  explicitly (see `_v` above).
- **Not the raw body.** Paymob is unusual: you must parse the JSON to extract the
  fields, then hash the concatenation — not the raw request bytes. Still verify
  before acting on the payload.
- **POST vs GET key paths differ.** POST nests under `obj` with `obj.order.id`
  and `obj.source_data.pan`; GET flattens to `order_id` and `source_data_pan`.

## How to Debug Verification Failures

1. Log your computed HMAC and the received `hmac` param side by side.
2. Confirm the digest length is **128** hex chars (SHA512). If it's 64, you're on
   SHA256.
3. Print the concatenated string and check the field order and that booleans are
   lowercase.
4. Confirm you're using the **HMAC secret** from the dashboard, not the API key.
5. Ensure numeric values (`amount_cents`, `id`, `integration_id`, `owner`) are
   stringified exactly as sent (no thousands separators, no trailing `.0`).
