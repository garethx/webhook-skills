# Strava Webhook Verification

## How It Works — There Is No Event Signature

Unlike Stripe, GitHub, or Shopify, Strava does **not** sign webhook events. There
is no `X-Strava-Signature` header, no HMAC, and no shared secret transmitted with
each POST. **Do not look for a signature header — there isn't one.**

Instead, authenticity is established in two layers:

1. **Subscription validation handshake (one-time).** When you create the
   subscription, Strava issues a `GET` to your callback URL carrying a
   `hub.verify_token` that only you and Strava know. Echoing the challenge proves
   *you own the endpoint* and completes the trust setup.
2. **`subscription_id` check (per-event, optional but recommended).** Every event
   includes the `subscription_id` it belongs to. Reject events whose
   `subscription_id` doesn't match the one you created.

## The Validation Handshake

When you `POST` to create the subscription, Strava immediately sends:

```
GET /webhooks/strava?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=15f7d1a91c1f40f8a748fd134752feb3
```

| Query param | Value |
|-------------|-------|
| `hub.mode` | Always `subscribe` |
| `hub.verify_token` | Whatever `verify_token` you passed when creating the subscription |
| `hub.challenge` | A random string you must echo back |

Your endpoint must confirm `hub.verify_token` matches your stored token and
respond **within 2 seconds** with:

- Status `200`
- `Content-Type: application/json`
- Body: `{"hub.challenge":"15f7d1a91c1f40f8a748fd134752feb3"}` — the **exact** key
  `hub.challenge` (with the dot) and the echoed challenge value.

If the token doesn't match, respond `403` and Strava's subscription creation fails
with `callback url ... not verifiable`.

## Implementation

There is no official Strava SDK — all client libraries are community-maintained —
so verification is implemented manually in every language. Use a **timing-safe**
comparison for the token.

### Node.js

```javascript
const crypto = require('crypto');

function tokenMatches(received, expected) {
  const a = Buffer.from(received || '');
  const b = Buffer.from(expected || '');
  // timingSafeEqual throws on length mismatch — guard first
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GET handler
function handleValidation(query, expectedToken) {
  if (query['hub.mode'] === 'subscribe' && tokenMatches(query['hub.verify_token'], expectedToken)) {
    return { status: 200, body: { 'hub.challenge': query['hub.challenge'] } };
  }
  return { status: 403, body: 'Forbidden' };
}
```

### Python

```python
import hmac

def token_matches(received: str, expected: str) -> bool:
    # compare_digest is constant-time
    return hmac.compare_digest(received or "", expected or "")

# GET handler
def handle_validation(params, expected_token):
    if params.get("hub.mode") == "subscribe" and token_matches(
        params.get("hub.verify_token", ""), expected_token
    ):
        return 200, {"hub.challenge": params.get("hub.challenge")}
    return 403, "Forbidden"
```

## Per-Event `subscription_id` Check

Because events are unsigned, anyone who discovers your callback URL could POST a
forged payload. Mitigate this by verifying the `subscription_id`:

```javascript
if (process.env.STRAVA_SUBSCRIPTION_ID &&
    String(event.subscription_id) !== String(process.env.STRAVA_SUBSCRIPTION_ID)) {
  return res.status(403).send('Unknown subscription');
}
```

For stronger protection, keep the callback path secret/unguessable, and always
re-fetch the object from the Strava REST API (which requires a valid access token)
rather than trusting fields in the payload.

## Common Gotchas

### 1. The JSON key is `hub.challenge`, with a dot

The response body key is literally `"hub.challenge"` — not `challenge`,
`hub_challenge`, or `hubChallenge`. A common mistake:

```javascript
// WRONG
res.json({ challenge: req.query['hub.challenge'] });
// CORRECT
res.json({ 'hub.challenge': req.query['hub.challenge'] });
```

### 2. Query params also use dots

The incoming query keys are `hub.mode`, `hub.verify_token`, and `hub.challenge`.
Read them by bracket notation (`req.query['hub.verify_token']`), not dotted
property access.

### 3. The 2-second deadline

Strava aborts validation (and each event) if you don't respond within 2 seconds.
Do the token check and echo synchronously; defer any real work.

### 4. Don't look for a signature

There is no signing secret and no signature header on events. If you're searching
for one, stop — validate via the handshake and `subscription_id` instead.

### 5. Endpoint must be live before you subscribe

Strava validates synchronously during subscription creation. If your callback
isn't deployed and reachable, creation fails immediately.

## Debugging Validation Failures

| Error | Fix |
|-------|-----|
| `callback url ... not verifiable` | Ensure the `GET` returns `200` with `{"hub.challenge": "<echoed>"}` in under 2s |
| Token mismatch → `403` | `STRAVA_VERIFY_TOKEN` must equal the `verify_token` you POSTed |
| Challenge not echoed | You returned the wrong JSON key — must be `hub.challenge` |
| Validation `GET` never seen | `callback_url` unreachable, not HTTPS, or > 255 chars |

## Full Documentation

See the [Strava Webhook Events API documentation](https://developers.strava.com/docs/webhooks/).
