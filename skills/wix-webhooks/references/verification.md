# How to Verify Wix Webhook Signatures

## Why Verification Matters

Anyone can POST to your public webhook URL. Verification proves a request genuinely came from Wix and wasn't tampered with. Wix signs every webhook, so a request that fails verification must be rejected before you act on it.

## How It Works

- The **entire request body is a JSON Web Token (JWT)** signed by Wix using **RS256** (RSA + SHA-256).
- You verify it with your app's **public key** (App Dashboard → **Webhooks → Get Public Key**, or **View ID & keys**). The key is per-app; there is **no** global JWKS endpoint.
- This is **not** Standard Webhooks: there are no `webhook-id` / `webhook-signature` headers and no HMAC. The signature lives in the JWT itself.
- The JWT includes `iat` (issued-at) and `exp` (expiry) claims, which a proper JWT verifier checks automatically.

> **Note on the `digest` header:** For _encrypted data payloads_ (not webhooks), Wix sends the JWT in a `digest` header. **Webhooks are different** — the JWT is the whole body, and webhook payloads are not encrypted.

## Decoded Structure

The JWT payload is nested; each `data` field is a JSON **string** you must parse:

```
outer JWT payload:  { data: "<json string>", iat, exp }
  parse data →      { eventType, instanceId, data: "<json string>" }
    parse data →    { id, entityFqdn, slug, entityId, eventTime, createdEvent|updatedEvent|... }
```

- `eventType` — e.g. `wix.ecom.v1.order_canceled`
- `instanceId` — the app instance (site) the event is for
- `id` (inner payload) — unique event ID, use it to **deduplicate**

## Implementation

### SDK Verification (Node.js — recommended)

`@wix/sdk` verifies the RS256 signature (using `jose` internally) **and** decodes/dispatches the event in one step. Always pass the **raw text body** — never a re-serialized object.

```javascript
import { AppStrategy, createClient } from '@wix/sdk';
import { orders } from '@wix/ecom';

const client = createClient({
  auth: AppStrategy({
    appId: process.env.WIX_APP_ID,
    publicKey: process.env.WIX_PUBLIC_KEY.replace(/\\n/g, '\n'),
  }),
  modules: { orders },
});

client.orders.onOrderCanceled((event) => {
  // event.metadata.instanceId, event.metadata._id (event ID), event.metadata.entityId
});

// In your route — raw body in, throws on an invalid signature or expired token:
await client.webhooks.process(rawBody);
```

Register handlers with the `on<Event>` methods (`onOrderCreated`, `onOrderApproved`, `onOrderUpdated`, `onOrderCanceled`, …). `process()` verifies the signature, then invokes any handlers matching the decoded `eventType`.

### Manual Verification (fallback — e.g. Python / FastAPI)

There is no official Wix **server** SDK for Python, so verify the JWT yourself with a standard JWT library and your public key. Any language works the same way (verify RS256 with the public key, then parse the two nested `data` strings).

```python
import json
import jwt  # PyJWT (requires the 'cryptography' extra for RS256)

def verify_and_decode(raw_body: bytes, public_key: str) -> dict:
    # 1. Verify signature + exp/iat with the RSA public key. Raises on failure.
    decoded = jwt.decode(raw_body, public_key, algorithms=["RS256"])
    # 2. Unwrap the nested envelope.
    event = json.loads(decoded["data"])            # { eventType, instanceId, data }
    event["entity"] = json.loads(event["data"])    # { id, entityId, createdEvent|... }
    return event
```

Manual verification in Node without the SDK follows the same pattern using `jsonwebtoken`:

```javascript
const jwt = require('jsonwebtoken');
const rawPayload = jwt.verify(rawBody, publicKey);       // verifies RS256 + exp
const event = JSON.parse(rawPayload.data);               // { eventType, instanceId, data }
const eventData = JSON.parse(event.data);                // inner entity/event payload
```

## Common Gotchas

- **Use the raw body.** Verify the exact bytes Wix sent. Parsing to JSON and re-stringifying changes the bytes and breaks the signature. In Express use `express.text()`; in FastAPI use `await request.body()`; in Next.js use `await req.text()`.
- **It's a JWT, not an HMAC header.** Don't look for `X-Wix-Signature` — there isn't one. The signature is inside the body.
- **Public key, not a secret.** You verify with the RSA **public** key from the dashboard, not the app secret.
- **PEM newlines.** When stored in an env var on one line, convert `\n` escapes back to real newlines before use (`WIX_PUBLIC_KEY.replace(/\\n/g, '\n')`). `@wix/sdk` also accepts a base64-encoded PEM.
- **Expiry.** The JWT has `exp`/`iat` claims and verification will reject expired tokens. Keep your server clock in sync.
- **Duplicates & ordering.** Retries mean the same event can arrive multiple times and out of order. Dedupe on the event `id` (`event.metadata._id` via the SDK) and return 200 fast.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| `invalid signature` / `signature verification failed` | Wrong public key, or the body was parsed/re-serialized before verifying |
| `jwt expired` / `exp` error | Server clock skew, or replaying an old captured event |
| `secretOrPublicKey must be...` (PyJWT/jsonwebtoken) | PEM newlines not restored, or key passed base64-encoded to a lib that expects PEM |
| SDK: `Unexpected event type: ...` | No handler registered for that `eventType`; register the matching `on<Event>` handler |
| Handler never fires | Verified fine but no handler for the decoded `eventType`, or you subscribed to a different event in the dashboard |

Use the **Logs** tab on your app's Webhooks page to inspect exactly what Wix sent.
