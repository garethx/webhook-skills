# How to Verify WeChat Pay Webhook Signatures

## Why Signature Verification Matters

A `notify_url` is public. Without verification, anyone could POST a fake `TRANSACTION.SUCCESS` and trick you into fulfilling an unpaid order. WeChat Pay APIv3 signs every notification with its private key so you can prove authenticity using the **platform public key**.

## How WeChat Pay Signing Works

WeChat Pay APIv3 uses **asymmetric** signatures — **SHA256withRSA** (RSA with SHA-256, PKCS#1 v1.5 padding). This is **not HMAC** and **not** the Standard Webhooks spec (`webhook-id` / `webhook-timestamp` / `webhook-signature`).

### Headers

| Header | Meaning |
|--------|---------|
| `Wechatpay-Signature` | Base64-encoded RSA signature |
| `Wechatpay-Timestamp` | Unix epoch seconds when WeChat Pay signed |
| `Wechatpay-Nonce` | Random string included in the signed message |
| `Wechatpay-Serial` | Serial number of the platform certificate/public key that signed — use it to select the right key |

### Signed message

Reconstruct the message exactly, **each line terminated by `\n`** (including a trailing newline after the body):

```
{timestamp}\n{nonce}\n{body}\n
```

- `timestamp` = `Wechatpay-Timestamp` value
- `nonce` = `Wechatpay-Nonce` value
- `body` = the **raw request body bytes**, before any JSON parsing

Then Base64-decode `Wechatpay-Signature` and verify it against the platform public key (matched by `Wechatpay-Serial`) with SHA256withRSA.

### Replay protection

Reject notifications whose `Wechatpay-Timestamp` is more than **5 minutes** (300 seconds) away from the current time.

## The Two-Step Payload

The signed `body` is the **encrypted** envelope. The order of operations is:

1. **Verify** the signature over the raw body.
2. **Decrypt** `resource.ciphertext` with your APIv3 key to recover the business JSON.

Never `JSON.parse` the body before verifying — re-serialization changes bytes and breaks the signature.

## Resource Decryption (AEAD_AES_256_GCM)

The `resource` object:

```json
{
  "algorithm": "AEAD_AES_256_GCM",
  "ciphertext": "...base64...",
  "nonce": "...12-byte IV...",
  "associated_data": "transaction"
}
```

Decrypt with:

- **Key:** your 32-byte APIv3 key
- **IV / nonce:** `resource.nonce` (12 bytes)
- **AAD:** `resource.associated_data` (may be empty)
- **Auth tag:** the **last 16 bytes** of the Base64-decoded `ciphertext`

## Implementation

### Node.js (manual — recommended for webhook verification)

```javascript
const crypto = require('crypto');

function verifySignature(timestamp, nonce, rawBody, signatureB64, platformPublicKey) {
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const verifier = crypto.createVerify('RSA-SHA256').update(message, 'utf8');
  try {
    return verifier.verify(platformPublicKey, signatureB64, 'base64');
  } catch {
    return false;
  }
}

function decryptResource({ ciphertext, nonce, associated_data }, apiV3Key) {
  const buf = Buffer.from(ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', apiV3Key, nonce);
  decipher.setAuthTag(buf.subarray(buf.length - 16));
  if (associated_data) decipher.setAAD(Buffer.from(associated_data));
  const plain = Buffer.concat([decipher.update(buf.subarray(0, -16)), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
```

### Python (manual — recommended for FastAPI)

```python
import base64, time
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidSignature

def verify_signature(timestamp, nonce, raw_body, signature_b64, public_key_pem):
    public_key = serialization.load_pem_public_key(public_key_pem.encode())
    message = f"{timestamp}\n{nonce}\n{raw_body}\n".encode("utf-8")
    try:
        public_key.verify(base64.b64decode(signature_b64), message,
                          padding.PKCS1v15(), hashes.SHA256())
        return True
    except InvalidSignature:
        return False

def decrypt_resource(resource, apiv3_key):
    aesgcm = AESGCM(apiv3_key.encode("utf-8"))
    data = base64.b64decode(resource["ciphertext"])
    aad = resource.get("associated_data") or ""
    plaintext = aesgcm.decrypt(resource["nonce"].encode("utf-8"), data, aad.encode("utf-8"))
    return plaintext.decode("utf-8")
```

## SDK Alternatives

WeChat Pay maintains SDKs that can verify signatures and manage platform certificate rotation:

- Node.js: [`wechatpay-node-v3`](https://www.npmjs.com/package/wechatpay-node-v3), [`wechatpay-axios-plugin`](https://www.npmjs.com/package/wechatpay-axios-plugin)
- Python: [`wechatpayv3`](https://pypi.org/project/wechatpayv3/)

These are useful when you also make outbound API calls and want automatic certificate downloading/rotation. For a pure inbound webhook handler, manual verification with the standard crypto libraries (above) is transparent, dependency-light, and easy to test in CI — which is why the runnable examples in this skill use it.

## Common Gotchas

- **Use the raw body.** Verify before parsing; re-serialized JSON will not match the signature.
- **Trailing newline.** The signed message ends with `\n` after the body — don't omit it.
- **Platform key, not merchant key.** Verify with the WeChat Pay *platform* public key, selected by `Wechatpay-Serial`.
- **Auth tag placement.** For AES-256-GCM, the 16-byte auth tag is appended to the ciphertext — split it off before decrypting.
- **Certificate rotation.** Key your public keys by serial; WeChat adds new serials ~24h ahead.
- **Re-check the amount.** A valid signature proves authenticity, not correctness — re-verify `amount.total` and `out_trade_no` against your order before fulfilling.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always invalid | Body was parsed/re-serialized; missing trailing `\n`; wrong (merchant vs platform) key |
| Worked, then broke | Platform certificate rotated — refresh `GET /v3/certificates` and match `Wechatpay-Serial` |
| Decryption throws | Wrong APIv3 key, wrong nonce, or auth tag not split from ciphertext |
| Intermittent 401-style rejects | Timestamp outside the 5-minute tolerance (clock skew) |
