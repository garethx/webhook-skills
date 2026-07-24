# How to Verify Microsoft SharePoint Webhooks

## Why There Is No Signature

SharePoint webhooks are **not** HMAC-signed and do **not** use Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`). There is no cryptographic request signature at all. Instead, authenticity rests on two mechanisms:

1. The **validation handshake** proves you own the `notificationUrl` (SharePoint only creates the subscription if you echo its token).
2. **`clientState`** is a shared secret you set at subscription time and compare on every notification.

Neither is a signature, so treat SharePoint notifications as lower-trust and always re-fetch authoritative data via GetChanges using an authenticated SharePoint call.

## 1. The Validation Handshake

When a subscription is created — or its `notificationUrl` changes — SharePoint sends:

```
POST https://your-app.example.com/webhooks/microsoft-sharepoint?validationtoken=<randomString>
Content-Length: 0
```

You must respond within **~5 seconds**:

```
HTTP/1.1 200 OK
Content-Type: text/plain

<randomString>
```

Rules:

- Echo the `validationtoken` **query-string** value verbatim as the response body.
- Use `Content-Type: text/plain`.
- Return status `200`. Any other status (or a slow response) fails subscription creation.
- The request body is empty — the token is only in the query string.
- Check for the token **before** parsing or validating anything else, so the handshake stays fast.

## 2. clientState Comparison

Set `clientState` when creating the subscription. SharePoint echoes it in every notification:

```json
{ "value": [ { "clientState": "your-opaque-secret", "resource": "…", "subscriptionId": "…" } ] }
```

Compare it to your stored secret using a timing-safe comparison. Reject notifications whose `clientState` does not match.

## Implementation

There is no official SDK helper for verifying incoming notifications (the SharePoint/PnP SDKs are for *making* API calls like creating subscriptions and GetChanges, not for verifying inbound requests). So all frameworks verify manually.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function clientStateMatches(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;   // avoid timingSafeEqual throwing on length mismatch
  return crypto.timingSafeEqual(a, b);
}

// Handshake first:
const token = new URL(req.url, 'http://localhost').searchParams.get('validationtoken');
if (token) {
  res.setHeader('Content-Type', 'text/plain');
  return res.status(200).send(token);
}

// Then clientState on each batched notification:
const { value = [] } = JSON.parse(rawBody);
if (!value.every(n => clientStateMatches(n.clientState, process.env.SHAREPOINT_CLIENT_STATE))) {
  return res.status(400).send('Invalid clientState');
}
```

### Python (FastAPI)

```python
import hmac, os

def client_state_matches(received: str, expected: str) -> bool:
    if not isinstance(received, str) or not isinstance(expected, str):
        return False
    return hmac.compare_digest(received, expected)  # timing-safe

# Handshake first:
token = request.query_params.get("validationtoken")
if token is not None:
    return PlainTextResponse(token, status_code=200)

# Then clientState on each batched notification:
body = await request.json()
expected = os.environ["SHAREPOINT_CLIENT_STATE"]
if not all(client_state_matches(n.get("clientState", ""), expected) for n in body.get("value", [])):
    raise HTTPException(status_code=400, detail="Invalid clientState")
```

## Common Gotchas

- **Handshake before everything.** If you parse the JSON body first, the empty-body validation request may error before you ever echo the token — and subscription creation fails.
- **Respond within ~5 seconds** to the handshake. Do all heavy work (GetChanges) asynchronously, after returning `200`.
- **`text/plain`, not JSON.** Returning the token as JSON (quoted) breaks the handshake.
- **`clientState` may be absent** if you did not set it at subscription time. If you rely on it, always set it — and reject notifications missing or mismatching it.
- **No change details in the payload.** The notification tells you *that* something changed in a list (`resource` GUID), not *what*. Call GetChanges with a stored change token.
- **Return 2xx fast.** Non-2xx or timeouts trigger 5 retries at 5-minute intervals and can cause duplicate processing — handle changes idempotently.

## Debugging

| Symptom | Likely cause |
|---------|--------------|
| Subscription creation fails immediately | Handshake not answered in time, wrong status, or token not echoed as `text/plain` |
| Notifications rejected with 400 | `clientState` mismatch — the secret sent at subscription time differs from `SHAREPOINT_CLIENT_STATE` |
| Duplicate processing | Slow handler → SharePoint retried; process changes idempotently |
| Notifications stop arriving | Subscription expired (max 180 days) — renew with `PATCH` before `expirationDateTime` |
