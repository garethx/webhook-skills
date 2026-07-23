# LinkedIn Signature Verification

LinkedIn webhook security has **two independent HMAC-SHA256 checks**, both keyed with your app's **`clientSecret`** and both encoded as **lowercase hex**. LinkedIn does **not** follow the Standard Webhooks spec.

## 1. Endpoint Validation (GET challenge)

Before registration — and every 2 hours after — LinkedIn sends an HTTP `GET` to your webhook URL with a `challengeCode` query parameter:

```http
GET https://api.example.com/webhooks/linkedin?challengeCode=890e4665-4dfe-4ab1-b689-ed553bceeed0
```

You must respond within **3 seconds** with `Content-Type: application/json`, HTTP `200`, and a body echoing the code plus its HMAC:

```
challengeResponse = Hex-encoded( HMACSHA256( challengeCode, clientSecret ) )
```

- **Message:** the raw `challengeCode` UUID string.
- **Key:** `clientSecret`.

```json
{
  "challengeCode": "890e4665-4dfe-4ab1-b689-ed553bceeed0",
  "challengeResponse": "27b1d19678542072a7f1d0ce845d0c78cec22567f413697e25648f44fa3d1514"
}
```

If a parent/child integration sends an `applicationId` query parameter, sign with the `clientSecret` of that challenged application.

Failure surfaces as: `This URL did not pass the security challenge check`. Three consecutive failures block the endpoint.

## 2. Push Event Signature (POST X-LI-Signature)

Every `POST` notification carries an `X-LI-Signature` header:

```
stringToSign   = "hmacsha256=" + <raw JSON POST body>
X-LI-Signature = Hex-encoded( HMACSHA256( stringToSign, clientSecret ) )
```

- **Message:** the literal string `hmacsha256=` **followed by the raw request body**.
- **Key:** `clientSecret`.
- **The header value is the bare hex digest** — the `hmacsha256=` prefix is *only* part of the string-to-sign, never part of the header.
- Compare with a **constant-time** comparison; discard on mismatch.

## Implementation

There is **no SDK method** for LinkedIn webhook verification — the official `linkedin-api-client` is a REST API client, not a webhook verifier. Verify manually in every framework.

### Node.js

```javascript
const crypto = require('crypto');

function challengeResponse(challengeCode, clientSecret) {
  return crypto.createHmac('sha256', clientSecret).update(challengeCode).digest('hex');
}

function verifySignature(rawBody, signatureHeader, clientSecret) {
  const stringToSign = 'hmacsha256=' + rawBody; // rawBody is a string or Buffer
  const expected = crypto.createHmac('sha256', clientSecret).update(stringToSign).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader || '', 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // malformed / wrong-length header
  }
}
```

### Python

```python
import hmac, hashlib

def challenge_response(challenge_code: str, client_secret: str) -> str:
    return hmac.new(client_secret.encode(), challenge_code.encode(), hashlib.sha256).hexdigest()

def verify_signature(raw_body: bytes, signature_header: str, client_secret: str) -> bool:
    string_to_sign = b"hmacsha256=" + raw_body
    expected = hmac.new(client_secret.encode(), string_to_sign, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header or "", expected)
```

## Common Gotchas

- **Raw body only.** Do not parse, re-serialize, or pretty-print the JSON before hashing. Use the exact bytes received. Frameworks that auto-parse JSON (Express `json()`, Next.js) must expose the raw body.
- **Prefix placement.** `hmacsha256=` is prepended to the body *before* hashing; it is not in the `X-LI-Signature` header.
- **Same secret, different message.** Both checks use `clientSecret`; the challenge signs the UUID, the push signs `"hmacsha256=" + body`.
- **Constant-time compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`. Wrap `timingSafeEqual` in try/catch — it throws on length mismatch.
- **3-second GET budget.** Compute the challenge response synchronously; don't block on I/O.
- **Dedupe.** Verify first, then dedupe on `notificationId` before processing.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `This URL did not pass the security challenge check` | Wrong `clientSecret`, hashing the wrong field, not returning JSON, or slower than 3s |
| POST signatures never match | Forgot the `hmacsha256=` prefix, or hashed the parsed/re-serialized body instead of raw bytes |
| Intermittent failures | Body mutated by middleware (compression, proxies) before hashing |
| Endpoint shows `BLOCKED` | 3 consecutive re-validation failures — fix and re-validate from the portal |
