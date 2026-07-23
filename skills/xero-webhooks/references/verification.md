# How to Verify Xero Webhook Signatures

## Why Signature Verification Matters

Your Xero webhook endpoint is a public URL. Signature verification is how you prove a request genuinely came from Xero and wasn't forged or tampered with in transit. Xero also uses this same mechanism to gate activation: during **Intent to Receive (ITR)** it deliberately sends a badly-signed request and expects you to reject it.

## How Xero's Signature Scheme Works

1. Xero computes `HMAC-SHA256(rawRequestBody, webhookSigningKey)`.
2. It **base64-encodes** the resulting digest.
3. It sends that value in the **`x-xero-signature`** HTTP header.

To verify, recompute the HMAC over the **raw** body with your signing key, base64-encode it, and compare it to the header using a constant-time comparison.

| Property | Value |
|----------|-------|
| Header | `x-xero-signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | Raw request body (exact bytes) |
| Encoding | Base64 |
| Key | App's **webhook signing key** (`XERO_WEBHOOK_KEY`) |
| Comparison | Constant-time (timing-safe) |

> The official SDKs (`xero-node`, `xero-python`) do **not** include a webhook-signature helper. Verify manually with your language's crypto library — the algorithm is standard HMAC-SHA256.

## Implementation

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifyXeroSignature(rawBody, signatureHeader, signingKey) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(rawBody)          // rawBody is a Buffer/string of the EXACT bytes received
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;             // different lengths => invalid
  }
}
```

### Manual Verification (Python)

```python
import hmac, hashlib, base64

def verify_xero_signature(raw_body: bytes, signature_header: str, signing_key: str) -> bool:
    if not signature_header:
        return False
    expected = base64.b64encode(
        hmac.new(signing_key.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(signature_header, expected)
```

## Intent to Receive (ITR): Status Codes

ITR is where most Xero webhook setups go wrong. The rules are strict:

| Situation | Required response |
|-----------|-------------------|
| Signature **matches** | **HTTP 200** |
| Signature **does not match** | **HTTP 401** |
| Anything else (400, 500, timeout) | ITR **fails**, webhook stays inactive |

Return **`401`** — not `400` — for an invalid signature. Xero validates ITR by sending a correctly-signed payload (expects `200`) **and** a deliberately wrong-signed payload (expects `401`); an endpoint that returns `200` for everything will fail. The same verify-then-`200`/`401` code path handles both ITR probes and real events, so you don't need a special case for validation requests.

Respond within a few seconds — acknowledge fast and defer heavy processing (resource fetches, DB writes) to a background job.

## Common Gotchas

- **Raw body only.** Compute the HMAC over the *exact* bytes Xero sent. If a JSON body parser runs first, re-serialization changes the bytes (key order, whitespace, number formatting) and the signature will never match. In Express use `express.raw()`; in Next.js use `await request.text()`; in FastAPI use `await request.body()` — all **before** parsing.
- **Return 401, not 400, for bad signatures.** This is Xero-specific and required for ITR.
- **Wrong key.** `XERO_WEBHOOK_KEY` must be the *webhook signing key* from the app's Webhooks tab — not the client secret or client ID.
- **Missing header.** Treat a missing `x-xero-signature` as invalid (return `401`), don't throw.
- **Duplicates.** Xero batches and retries, so the same event may arrive multiple times. Verify, then dedupe idempotently on `resourceId` + `eventDateUtc`.
- **Header case.** HTTP headers are case-insensitive; frameworks usually expose them lowercased (`x-xero-signature`).

## Debugging Verification Failures

1. **Log the raw body length** you hash and confirm it's non-zero and un-parsed.
2. **Compare byte-for-byte:** log your computed base64 digest next to the `x-xero-signature` header (do this only in a safe/dev environment).
3. **Confirm the key:** re-copy the webhook signing key from [developer.xero.com/app/manage](https://developer.xero.com/app/manage).
4. **Check for proxies:** API gateways, load balancers, or middleware that reformat the body will break the HMAC. Verify before any transformation.
5. **Re-run ITR:** After fixing, click **Send "Intent to receive"** in the portal to re-activate the webhook.
