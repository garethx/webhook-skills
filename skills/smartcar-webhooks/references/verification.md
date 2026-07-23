# How to Verify Smartcar Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is publicly reachable, so anyone can POST to it. Smartcar
signs every webhook so you can prove it genuinely came from Smartcar and was not
tampered with in transit. Skipping verification means trusting arbitrary
attacker-controlled vehicle data.

## How Smartcar's Scheme Works

- **Header:** `SC-Signature`
- **Algorithm:** HMAC-SHA256, **hex**-encoded
- **Signed content:** the **raw request body** bytes, before JSON parsing
- **Key:** your **Application Management Token** (AMT) from the Dashboard
- **On failure:** return `401 Unauthorized` and do **not** process the payload

This is Smartcar's own scheme — **not** the Standard Webhooks spec. There are no
`webhook-id` / `webhook-timestamp` / `webhook-signature` headers and no
timestamp component. The header value is a plain hex HMAC of the body.

## The VERIFY Challenge

Separately from per-payload signatures, when you create (or re-verify) a webhook
Smartcar POSTs a one-time `VERIFY` event:

```json
{ "eventType": "VERIFY", "data": { "challenge": "3a5c8f72-..." }, "meta": { ... } }
```

You must respond within **15 seconds** with `200`,
`Content-Type: application/json`, and the challenge **hashed with the same AMT**:

```json
{ "challenge": "<hex HMAC-SHA256 of data.challenge, keyed with the AMT>" }
```

Until this succeeds the webhook never delivers vehicle data. The same
`hashChallenge` primitive underlies both the challenge response and per-payload
verification (the signature is just the HMAC of the whole body).

## Implementation

### SDK Verification (recommended)

Smartcar ships official Node and Python SDKs with two helpers:

- `hashChallenge(amt, string)` / `hash_challenge(amt, string)` → hex HMAC-SHA256
- `verifyPayload(amt, signature, body)` / `verify_payload(amt, signature, body)`
  → boolean

**Node** (`smartcar@^10`):

```javascript
const smartcar = require('smartcar');
const AMT = process.env.SMARTCAR_MANAGEMENT_TOKEN;

// VERIFY handshake
const hmac = smartcar.hashChallenge(AMT, event.data.challenge);
// -> respond 200 { challenge: hmac }

// Data-event verification. NOTE: the Node SDK computes the HMAC over
// JSON.stringify(body) internally, so pass the *parsed* event object,
// not the raw string.
const ok = smartcar.verifyPayload(AMT, req.headers['sc-signature'], event);
```

**Python** (`smartcar>=6`):

```python
import smartcar
amt = os.environ["SMARTCAR_MANAGEMENT_TOKEN"]

# VERIFY handshake
hmac = smartcar.hash_challenge(amt, event["data"]["challenge"])
# -> respond 200 {"challenge": hmac}

# Data-event verification. The Python SDK hashes the *raw body string* you pass.
ok = smartcar.verify_payload(amt, request.headers["sc-signature"], raw_body)
```

> **Node vs Python difference:** the Node SDK's `verifyPayload` re-serializes the
> parsed object (`hashChallenge(amt, JSON.stringify(body)) === signature`), so
> you pass the object. The Python SDK's `verify_payload` hashes the string you
> give it, so pass the raw decoded body. Getting this backwards causes silent
> verification failures.

### Manual Verification (fallback / byte-exact)

If you cannot use the SDK, or you want to hash the **exact raw bytes** (avoiding
any JSON re-serialization), compute the HMAC yourself and compare timing-safely.

**Node:**

```javascript
const crypto = require('crypto');

function verifySmartcar(amt, signatureHeader, rawBody) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', amt).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // length mismatch = invalid
  }
}
```

**Python:**

```python
import hmac, hashlib

def verify_smartcar(amt: str, signature_header: str, raw_body: bytes) -> bool:
    if not signature_header:
        return False
    expected = hmac.new(amt.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

The VERIFY challenge response is the same primitive:
`hmac.new(amt.encode(), challenge.encode(), hashlib.sha256).hexdigest()`.

## Common Gotchas

- **Use the raw body.** Verify before parsing JSON. Re-serializing a parsed
  object can change key order or whitespace and break the HMAC. When using the
  Node SDK, its `verifyPayload` re-serializes for you — pass the object; for
  byte-exact control use the manual helper above.
- **Hex, not base64.** `SC-Signature` is hex-encoded. Decoding as base64 fails.
- **The key is the Application Management Token**, not your client secret or a
  vehicle access token.
- **Answer VERIFY within 15 seconds** or the webhook never activates. Return the
  hashed challenge, not the raw challenge.
- **401, not 200, on bad signatures.** Never process an unverified payload.
- **Header casing.** HTTP headers are case-insensitive; frameworks lowercase
  them (`sc-signature`). Read it case-insensitively.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Every signature fails | Wrong secret (used client secret instead of AMT), or hashing a parsed/re-stringified body that differs from the raw bytes |
| Works in tests, fails in prod | A proxy/body-parser mutated the body before you hashed it — capture the raw body |
| Webhook never activates | VERIFY not answered within 15s, or you returned the raw challenge instead of its HMAC |
| `timingSafeEqual` throws | Signature and expected buffers differ in length — wrap in try/catch and return false |
| Base64 errors | You decoded the hex signature as base64 — compare hex strings |
