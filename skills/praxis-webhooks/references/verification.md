# How to Verify Praxis Webhook Signatures

## Why Signature Verification Matters

Your Praxis webhook endpoint is a public URL. Without verifying the
`gt-authentication` signature, anyone could POST a fake "approved" payment
notification and trick you into fulfilling an order. Verification proves the
notification was produced by someone holding your **Merchant Secret** — i.e.
Praxis.

## How Praxis Signs Webhooks

Praxis does **not** use HMAC and does **not** use the Standard Webhooks spec.
Instead:

1. It takes a **fixed, per-notification-type list of field values** in the
   documented order.
2. It **concatenates those values** into one string (no separator).
3. It **appends the Merchant Secret** to the end.
4. It computes `sha384(concatenated_values + merchant_secret)` and sends the
   **96-character lowercase hex** digest in the `gt-authentication` header.

### Field order (do NOT alphabetize)

> ⚠️ **Gotcha:** Praxis's *general API-request* signature sorts keys
> alphabetically (`ksort`) before hashing. **Webhooks do not** — they use the
> explicit documented field order per notification type. Alphabetizing the
> webhook fields produces a wrong digest and every verification fails.

**Payment Notification** (no `event` field):

```
merchant_id, application_key, timestamp, customer.customer_token, session.order_id,
transaction.tid, transaction.currency, transaction.amount, transaction.conversion_rate,
transaction.processed_currency, transaction.processed_amount
```

**Subscription Notification** (has an `event` field):

```
event, merchant_id, application_key, cid, plan_id, subscription_id,
subscription_status, timestamp
```

## Implementation

There is **no official server SDK** (Praxis ships only a browser Cashier JS SDK),
so verification is manual on every platform.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

const PAYMENT_FIELDS = ['merchant_id', 'application_key', 'timestamp', 'customer.customer_token',
  'session.order_id', 'transaction.tid', 'transaction.currency', 'transaction.amount',
  'transaction.conversion_rate', 'transaction.processed_currency', 'transaction.processed_amount'];
const SUBSCRIPTION_FIELDS = ['event', 'merchant_id', 'application_key', 'cid', 'plan_id',
  'subscription_id', 'subscription_status', 'timestamp'];

const at = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

function verifyPraxis(body, headerSig, merchantSecret) {
  const fields = body.event ? SUBSCRIPTION_FIELDS : PAYMENT_FIELDS;
  const data = fields.map((p) => String(at(body, p) ?? '')).join('') + merchantSecret;
  const expected = crypto.createHash('sha384').update(data, 'utf8').digest('hex');
  const a = Buffer.from(String(headerSig || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python (FastAPI)

```python
import hashlib, hmac

PAYMENT_FIELDS = ["merchant_id", "application_key", "timestamp", "customer.customer_token",
    "session.order_id", "transaction.tid", "transaction.currency", "transaction.amount",
    "transaction.conversion_rate", "transaction.processed_currency", "transaction.processed_amount"]
SUBSCRIPTION_FIELDS = ["event", "merchant_id", "application_key", "cid", "plan_id",
    "subscription_id", "subscription_status", "timestamp"]

def _at(obj, path):
    cur = obj
    for key in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur

def verify_praxis(body, header_sig, merchant_secret):
    fields = SUBSCRIPTION_FIELDS if body.get("event") else PAYMENT_FIELDS
    data = "".join("" if _at(body, p) is None else str(_at(body, p)) for p in fields) + merchant_secret
    expected = hashlib.sha384(data.encode("utf-8")).hexdigest()
    return hmac.compare_digest(expected, str(header_sig or ""))  # timing-safe
```

## Signing Your Acknowledgement

Praxis requires the `200` response to carry `"status": 0` **and** to be signed.
Compute `sha384(status + timestamp + merchant_secret)` and send it in the
`external-request-signature` header:

```javascript
const status = 0;
const timestamp = Math.floor(Date.now() / 1000);
const ackSig = crypto.createHash('sha384')
  .update(`${status}${timestamp}${merchantSecret}`, 'utf8').digest('hex');
// res.set('external-request-signature', ackSig).status(200).json({ status, timestamp });
```

## Common Gotchas

- **Parse before verify (deliberate exception).** The signature covers **field
  values**, not the raw request body, so you must parse the JSON first to rebuild
  the signed string. This is the opposite of HMAC-over-raw-body providers like
  Stripe. You still return `400` if the signature does not match.
- **Numbers vs strings.** Praxis sends amounts (`amount`, `processed_amount`,
  `conversion_rate`) as **strings** (e.g. `"10.00"`). If your JSON layer coerces
  `"10.00"` to the number `10`, `str(10)` → `"10"` and the digest breaks. Keep
  these values as strings exactly as received.
- **Do not alphabetize.** Webhook fields use the documented order, not `ksort`.
  Alphabetizing is only correct for the general API-request signature.
- **SHA-384, not SHA-256.** A valid `gt-authentication` value is **96** hex chars
  (SHA-384). 64 chars means you used SHA-256 by mistake.
- **Not an HMAC.** It is a plain hash of `values + secret`, not
  `HMAC-SHA384(secret, values)`. Using `createHmac` / `hmac.new` will never match.
- **Header is lowercase.** Inbound: `gt-authentication`. Outbound:
  `external-request-signature`. HTTP header lookups are case-insensitive, but
  match these names when logging.
- **Sign the ACK.** A `200` with an unsigned or wrong `external-request-signature`
  is treated as a failed delivery and retried.

## How to Debug Verification Failures

1. **Log the concatenated string** (never log the secret) and confirm the field
   order and that every value is present and stringified as received.
2. **Count the hex chars** in `gt-authentication` — 96 = SHA-384 (correct), 64 =
   SHA-256 (wrong algorithm).
3. **Confirm HMAC is not used** — it must be `hash(values + secret)`.
4. **Check amount formatting** — did a value arrive as `"10.00"` but get compared
   as `10`?
5. **Confirm the type routing** — a body with an `event` field must use the
   Subscription field list, otherwise the Payment field list.
