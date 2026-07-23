# How to Verify Cisco Meraki Webhooks

## How It Works

Meraki webhook alerts do **not** use an HMAC signature and do **not** follow the
Standard Webhooks spec. There is **no `webhook-signature` / `X-*-Signature`
header** to validate. Instead:

1. You set a **Shared secret** on the HTTP server in the Dashboard.
2. Meraki includes that exact string as a plaintext **`sharedSecret`** field
   **inside the JSON request body** of every webhook.
3. Your handler parses the body and compares `payload.sharedSecret` against the
   secret you configured (`MERAKI_WEBHOOK_SECRET`).

Because the secret is transmitted in cleartext, **TLS is the real transport
security**. Meraki requires HTTPS with a CA-trusted certificate (no self-signed
certs). The `sharedSecret` only proves the sender knows the value you set — it is
a bearer token in the body, not a cryptographic signature over the payload.

> Any generic "verify the signature header" logic will **not** work for Meraki.
> It is a literal string compare on a body field.

## Implementation

There is no official SDK method for webhook verification (the Meraki SDKs are
Dashboard API clients only), so verification is always "manual". Still, use a
**timing-safe** comparison to avoid leaking the secret via timing.

### Node.js

```javascript
const crypto = require('crypto');

function verifyMerakiWebhook(rawBody, secret) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const received = Buffer.from(String(payload.sharedSecret ?? ''));
  const expected = Buffer.from(String(secret ?? ''));
  // timingSafeEqual throws on length mismatch — guard first.
  return received.length === expected.length &&
    crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import json
import hmac

def verify_meraki_webhook(raw_body: bytes, secret: str) -> bool:
    try:
        payload = json.loads(raw_body)
    except ValueError:
        return False
    received = str(payload.get("sharedSecret", ""))
    # compare_digest is constant-time and length-safe.
    return hmac.compare_digest(received, secret or "")
```

## Common Gotchas

- **No signature header.** Don't look for `webhook-signature`, `X-Meraki-*`, or
  any HMAC. The secret is `payload.sharedSecret` in the body.
- **The secret is optional.** If you leave "Shared secret" blank in the
  Dashboard, `sharedSecret` may be absent or empty. Treat a configured
  `MERAKI_WEBHOOK_SECRET` as required and reject mismatches — otherwise anyone
  who discovers your URL can POST to it.
- **TLS matters more than the secret.** Terminate HTTPS with a CA-trusted cert;
  the secret is cleartext in the body.
- **Custom Liquid templates change the shape.** If the HTTP server uses a custom
  payload template, `sharedSecret` may be renamed, moved, or omitted, and headers
  may be added. Verify against whatever the template actually emits (or keep the
  default template so `sharedSecret` stays at the top level).
- **Use `alertTypeId`, not `alertType`, to dispatch.** The human label
  (`alertType`) can change; the id (`alertTypeId`) is stable.
- **Parse defensively.** A body that isn't valid JSON should fail verification,
  not throw a 500.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`
  rather than `==` so you don't leak the secret via response timing.

## Debugging Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every request rejected | `MERAKI_WEBHOOK_SECRET` doesn't match the Dashboard "Shared secret" | Copy the exact value from the HTTP server config |
| `sharedSecret` is `undefined` | Secret left blank in the Dashboard, or a custom template dropped it | Set a shared secret on the HTTP server; keep the default template |
| Works for "Send test" but not real alerts | Custom template applied only to some alerts | Standardize the payload template |
| Handler throws 500 on bad input | Parsing before validating | Wrap `JSON.parse` in try/catch and return 400 |
