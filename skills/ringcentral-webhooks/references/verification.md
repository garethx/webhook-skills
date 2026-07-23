# How to Verify RingCentral Webhooks

## Why RingCentral Is Different

RingCentral does **not** HMAC-sign webhook notifications and does **not** follow
the [Standard Webhooks](https://www.standardwebhooks.com/) spec. There is no
`webhook-signature`/`X-*-Signature` header to compute. Instead, authenticity is
established by two mechanisms:

1. **Validation-Token handshake** (mandatory) — proves you own the endpoint.
2. **Verification-Token** header (optional) — a shared secret confirming each
   notification came from your subscription.

## 1. The Validation-Token Handshake

When a subscription is created or renewed, RingCentral sends a request to your
`address` with a `Validation-Token` request header. Echo it back verbatim in a
`Validation-Token` **response** header and return `200`.

### Node.js (Express)

```javascript
const validationToken = req.get('Validation-Token');
if (validationToken) {
  res.set('Validation-Token', validationToken);
  return res.status(200).json({ status: 'ok' });
}
```

### Python (FastAPI)

```python
validation_token = request.headers.get("Validation-Token")
if validation_token:
    return Response(
        content='{"status":"ok"}',
        media_type="application/json",
        headers={"Validation-Token": validation_token},
    )
```

The handshake carries **no useful body** — respond based on the header alone. Do
this check *first*, before any Verification-Token check or body parsing.

## 2. The Verification-Token Check

If you set a `verificationToken` on the subscription, RingCentral includes it as
a `Verification-Token` header on **every** notification. Compare it to your
expected value using a timing-safe comparison and reject mismatches with `401`.

### Node.js

```javascript
const crypto = require('crypto');

function tokenMatches(received, expected) {
  const a = Buffer.from(received || '', 'utf8');
  const b = Buffer.from(expected || '', 'utf8');
  if (a.length !== b.length) return false;   // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(a, b);
}

if (EXPECTED_TOKEN && !tokenMatches(req.get('Verification-Token'), EXPECTED_TOKEN)) {
  return res.status(401).json({ error: 'Invalid verification token' });
}
```

### Python

```python
import hmac

def token_matches(received: str, expected: str) -> bool:
    return hmac.compare_digest(received or "", expected or "")

if EXPECTED_TOKEN and not token_matches(
    request.headers.get("Verification-Token"), EXPECTED_TOKEN
):
    raise HTTPException(status_code=401, detail="Invalid verification token")
```

The Verification-Token is optional but strongly recommended in production — it is
the only per-request authenticity signal RingCentral provides.

## Handler Order

```
1. Validation-Token present?  → echo it, return 200 (handshake, stop here)
2. Verification-Token check    → 401 on mismatch
3. Parse JSON body, dispatch on the `event` filter
4. Return 200 quickly
```

## Common Gotchas

### 1. Do the handshake before anything else

The validation request has no `Verification-Token` and no meaningful body. If you
check the Verification-Token or parse the body first, the handshake fails and the
subscription never activates.

### 2. Respond fast or get blacklisted

If your endpoint fails health/validation checks within ~10 minutes, RingCentral
blacklists the address and stops delivering (auto-reconciled ~every 15 min once
healthy). Acknowledge with `200` immediately, then process asynchronously.

### 3. Header casing

HTTP headers are case-insensitive. Frameworks lowercase them — read
`validation-token` / `verification-token` via your framework's header accessor
(`req.get(...)`, `request.headers.get(...)`), which is case-insensitive.

### 4. Timing-safe comparison

`crypto.timingSafeEqual` throws when buffers differ in length — guard with a
length check first (as above). In Python use `hmac.compare_digest`.

### 5. HTTPS and content type

The `address` must be HTTPS (TLS 1.2+), and responses should be small with
`Content-Type: application/json` to avoid `SUB-525` errors.

## Debugging Verification Failures

- **Subscription won't activate / blacklisted:** confirm the handshake echoes the
  `Validation-Token` response header and returns `200` within a few seconds.
- **All notifications 401:** confirm the `verificationToken` you set on the
  subscription exactly matches `RINGCENTRAL_VERIFICATION_TOKEN` in your app.
- **No notifications at all:** check the subscription status via
  `GET /restapi/v1.0/subscription/{id}` and confirm it isn't `Blacklisted` and
  hasn't expired.

## Full Documentation

- [Creating Webhooks](https://developers.ringcentral.com/guide/notifications/webhooks/creating-webhooks)
- [Receiving Webhooks](https://developers.ringcentral.com/guide/notifications/webhooks/receiving)
