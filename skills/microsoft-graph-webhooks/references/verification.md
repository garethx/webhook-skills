# Microsoft Graph Webhook Verification

Microsoft Graph does **not** sign notifications with an HMAC, and it does **not**
follow the Standard Webhooks spec. There is no official verification helper in the
SDKs. Authenticity comes from a three-part model.

## 1. Endpoint Validation Handshake

When you create (or renew) a subscription, Graph immediately sends:

```
POST https://your-app.example.com/webhooks/microsoft-graph?validationToken={opaqueToken}
Content-Type: text/plain; charset=utf-8
(empty body)
```

Your endpoint must respond, **within 10 seconds**, with:

- HTTP status `200 OK`
- `Content-Type: text/plain`
- Body = the **URL-decoded** validation token, as plain text

Most frameworks URL-decode query parameters for you (`req.query.validationToken`
in Express, `request.nextUrl.searchParams.get(...)` in Next.js,
`request.query_params.get(...)` in FastAPI), so you echo that value directly. If
you read the raw query string yourself, decode it first. Returning an encoded or
JSON-wrapped token fails validation and the subscription is not created.

```javascript
// Express
const token = req.query.validationToken;
if (token) {
  return res.status(200).type('text/plain').send(token);
}
```

## 2. clientState

This authenticates ordinary notifications. Set `clientState` (max 128 chars) when
creating the subscription; Graph echoes it in the `clientState` field of every
notification item. Compare it to your stored secret with a timing-safe, length-
checked comparison and reject mismatches.

### Manual verification (all frameworks — no SDK helper exists)

```javascript
const crypto = require('crypto');

function verifyClientState(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;   // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(a, b);
}
```

```python
import hmac

def verify_client_state(received: str | None, expected: str | None) -> bool:
    if not received or not expected:
        return False
    return hmac.compare_digest(received, expected)
```

A single POST can batch notifications from multiple subscriptions. If you run
subscriptions with different `clientState` values, look up the expected secret by
`subscriptionId` for each item rather than comparing against one global value.

## 3. Rich Notifications (includeResourceData: true)

When you subscribe with `includeResourceData: true`, each POST includes:

- A top-level **`validationTokens`** array of JWTs (one per app/tenant pair).
- Encrypted resource data in each item's **`encryptedContent`** object.

### Validate the JWT

For each token in `validationTokens`:

1. Confirm it is **not expired**.
2. Confirm it was **issued by the Microsoft identity platform**. Fetch signing
   keys from the OIDC metadata document
   `https://login.microsoftonline.com/common/.well-known/openid-configuration`
   (keys rotate ~daily; cache and refresh) and verify the signature.
3. Confirm the **audience** matches your app (client) ID.
4. Confirm the **caller identity** is Microsoft Graph Change Tracking, app ID
   **`0bf30f3b-4a52-48df-9a82-234910c4a086`**. For **v1.0** tokens this is the
   `appid` claim; for **v2.0** tokens it is the `azp` claim.

A `null` entry in `validationTokens` means Graph could not encrypt (usually an app
misconfiguration) — treat that batch as invalid.

### Decrypt the resource data

Each item's `encryptedContent` has `data`, `dataKey`, `dataSignature`,
`encryptionCertificateId`, and `encryptionCertificateThumbprint`.

1. **Unwrap the symmetric key**: RSA-decrypt `dataKey` with the **private key** of
   the certificate you supplied at subscribe time, using **OAEP** padding
   (Microsoft's samples use OAEP-SHA1).
2. **Verify integrity**: compute **HMAC-SHA256** over the base64-decoded `data`
   using the symmetric key, and compare (timing-safe) to the base64-decoded
   `dataSignature`. Reject on mismatch.
3. **Decrypt**: **AES-CBC** with **PKCS7** padding, using the symmetric key and an
   IV of the **first 16 bytes** of that key. The result is the JSON resource.

Because this requires your certificate's private key, it can't be verified with a
shared secret alone. Keep the private key server-side and never in the client.

## Common Gotchas

- **Handshake time limit is 10 seconds**, but ordinary notification delivery must
  be acknowledged within **3 seconds** (respond `202`, process async).
- **Echo the URL-decoded token** for the handshake — not URL-encoded, not JSON.
- **`clientState` can be absent** on malformed/forged requests — treat missing or
  mismatched `clientState` as invalid.
- **No HMAC over the body** in basic notifications — do not look for a signature
  header; there isn't one.
- **Rich notifications need your cert's private key** to decrypt; the JWT proves
  the sender, the AES layer protects the data.
- **Batching**: iterate `value`; a single request may carry several notifications.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Subscription create returns 400 / validation failed | Handshake didn't return the URL-decoded token as `text/plain` 200 within 10s |
| Notifications never arrive | `notificationUrl` not publicly reachable over HTTPS, or handshake failed |
| Handler rejects genuine notifications | `clientState` in `.env` doesn't match the value used when creating the subscription |
| Rich notification JWT rejected | Wrong audience (must be your app ID), or caller app ID isn't `0bf30f3b-4a52-48df-9a82-234910c4a086` |
| Decryption produces garbage | Wrong padding — use RSA-OAEP to unwrap `dataKey`, AES-CBC/PKCS7 with IV = first 16 bytes of the key |
