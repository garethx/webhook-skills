# How to Verify Twitch Webhook Signatures

## Why Signature Verification Matters

Your Twitch callback is a public HTTPS endpoint. Anyone can POST to it.
Verifying the HMAC signature proves the request came from Twitch and that the
body was not tampered with in transit.

## How It Works

Twitch computes an HMAC-SHA256 over the concatenation of three values, **in this
exact order**:

```
Twitch-Eventsub-Message-Id  +  Twitch-Eventsub-Message-Timestamp  +  <raw request body>
```

The digest is hex-encoded, prefixed with `sha256=`, and sent in the
`Twitch-Eventsub-Message-Signature` header:

```
Twitch-Eventsub-Message-Signature: sha256=<hex digest>
```

To verify, recompute the HMAC with your subscription secret and compare it to
the header value using a timing-safe comparison.

There is **no official SDK** for the webhook transport, so verification is always
manual. (`twurple` for Node and `twitchAPI` for Python are community libraries;
Twitch does not ship an official one.)

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyTwitchSignature(messageId, timestamp, rawBody, signatureHeader, secret) {
  if (!messageId || !timestamp || !signatureHeader) return false;

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(messageId);
  hmac.update(timestamp);
  hmac.update(rawBody); // string or Buffer — the UNPARSED body
  const expected = 'sha256=' + hmac.digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch => invalid
  }
}
```

### Python (FastAPI / manual)

```python
import hmac
import hashlib

def verify_twitch_signature(message_id, timestamp, raw_body, signature_header, secret):
    if not (message_id and timestamp and signature_header):
        return False

    message = message_id.encode() + timestamp.encode() + raw_body  # raw_body is bytes
    expected = "sha256=" + hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

## The Three Message Types

After verifying the signature, branch on `Twitch-Eventsub-Message-Type`:

- **`webhook_callback_verification`** — respond HTTP 200 with the raw
  `challenge` string from the parsed body as the body, `Content-Type:
  text/plain`. Do **not** JSON-wrap it and do **not** add quotes.
- **`notification`** — process `payload.event`, then return any 2XX.
- **`revocation`** — the subscription was stopped. Log
  `payload.subscription.status` (`user_removed`, `authorization_revoked`,
  `notification_failures_exceeded`, `version_removed`) and return 2XX.

## Replay Protection

Delivery is **at-least-once**. To protect against replays and duplicates:

- **Dedupe** on `Twitch-Eventsub-Message-Id` — store seen IDs and skip repeats.
- **Reject old timestamps** — if `Twitch-Eventsub-Message-Timestamp` is more than
  10 minutes in the past, reject the request.

## Common Gotchas

- **Must use the raw body.** Parsing then re-serializing JSON reorders or
  reformats bytes and breaks the HMAC. Read the raw bytes before parsing.
- **Order matters.** The signed message is `id + timestamp + body`, concatenated
  with no separators. Any other order fails.
- **Include the `sha256=` prefix** when comparing — the header value contains it.
- **The secret is per-subscription.** It is the value you passed as
  `transport.secret` when creating the subscription, not a dashboard value.
- **Header names are case-insensitive** but frameworks lowercase them
  (`twitch-eventsub-message-signature`).
- **Respond fast.** Twitch expects a response within a few seconds; repeated
  slow/failed responses cause revocation.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Signature never matches | Body was parsed/re-serialized before hashing — use the raw body |
| Works sometimes, fails others | Wrong concatenation order or missing a header value |
| Subscription stuck `verification_pending` | Challenge not echoed as raw `text/plain`, or signature rejected on the verification request |
| `timingSafeEqual` throws | Compare inside a try/catch — differing lengths throw; treat as invalid |
| All requests rejected | Using a different secret than the one passed at subscription creation |
