# How to Verify ShipStation Webhooks

## Why There Is No Signature (V1)

The ShipStation **V1 API** (`ssapi.shipstation.com`) — the source this skill targets — does **not**
sign webhook deliveries. There is **no HMAC, no signing secret, and no signature header**. So there
is nothing to verify cryptographically.

Instead, V1's trust model has two parts:

1. **A secret token in the target URL.** Because anyone who learns your endpoint URL could POST to
   it, keep the URL secret by embedding an unguessable token
   (`https://you.com/webhooks/shipstation?token=…`) and validating it on every request, over HTTPS.
2. **An authenticated fetch-back.** The webhook body only contains a `resource_url` +
   `resource_type`. You fetch `resource_url` with **HTTP Basic auth** (API key : API secret). The
   real data only comes from an authenticated call to ShipStation's own API, so a forged webhook body
   can't inject fake order data unless it also points at a ShipStation URL you then authenticate to.

## How It Works

```
ShipStation ──POST {resource_url, resource_type}──▶  https://you.com/webhooks/shipstation?token=SECRET
                                                     │ 1. timing-safe compare ?token vs SHIPSTATION_WEBHOOK_SECRET
                                                     │ 2. GET resource_url with Basic auth (key:secret)
                                                     ▼
                                              ssapi.shipstation.com  ──▶  real order/shipment JSON
```

## Implementation

There is no SDK for V1 webhook verification (the `shipengine` packages target ShipEngine / V2).
Implement the two checks manually.

### 1. Timing-safe token check

**Node.js**

```javascript
const crypto = require('crypto');

function verifyToken(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard it
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

**Python**

```python
import hmac

def verify_token(provided: str | None, expected: str | None) -> bool:
    if not provided or not expected:
        return False
    return hmac.compare_digest(provided, expected)
```

### 2. Authenticated resource fetch (with SSRF guard)

> **Note:** `resource_url` hosts are reportedly numbered (`ssapi1.shipstation.com`, `ssapi2.shipstation.com`,
> …), so the SSRF guard must match a **pattern**, not a fixed hostname — a strict `=== 'ssapi.shipstation.com'`
> check rejects real deliveries.

**Node.js**

```javascript
// Matches ssapi.shipstation.com and the numbered ssapi<N>.shipstation.com hosts
const SHIPSTATION_HOST_RE = /^ssapi\d*\.shipstation\.com$/;

async function fetchResource(resourceUrl, key, secret) {
  // Only ever fetch ShipStation's own host
  if (!SHIPSTATION_HOST_RE.test(new URL(resourceUrl).hostname)) {
    throw new Error('Refusing to fetch non-ShipStation host');
  }
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(resourceUrl, { headers: { Authorization: `Basic ${auth}` } });
  if (res.status === 429) {
    throw new Error(`Rate limited; reset in ${res.headers.get('X-Rate-Limit-Reset')}s`);
  }
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}
```

**Python**

```python
import re
import httpx
from urllib.parse import urlparse

# Matches ssapi.shipstation.com and the numbered ssapi<N>.shipstation.com hosts
SHIPSTATION_HOST_RE = re.compile(r"ssapi\d*\.shipstation\.com")

async def fetch_resource(resource_url: str, key: str, secret: str):
    host = urlparse(resource_url).hostname or ""
    if not SHIPSTATION_HOST_RE.fullmatch(host):
        raise ValueError("Refusing to fetch non-ShipStation host")
    async with httpx.AsyncClient() as client:
        res = await client.get(resource_url, auth=(key, secret))
        if res.status_code == 429:
            raise RuntimeError(f"Rate limited; reset in {res.headers.get('X-Rate-Limit-Reset')}s")
        res.raise_for_status()
        return res.json()
```

## Common Gotchas

- **Do not expect a signature header.** V1 has none. Any code looking for `X-…-Signature` on a V1
  webhook is wrong — you're either on V2 (see below) or reading stale docs.
- **Keep the endpoint URL (and its token) secret.** It is the only thing gating who can POST to you.
  Serve the endpoint over HTTPS so the token isn't exposed in transit.
- **Always guard the fetch host.** A tampered body could set `resource_url` to an attacker host;
  refuse anything that isn't a `ssapi<N>.shipstation.com` host before fetching (SSRF protection).
- **Handle the 40 req/min rate limit.** Fetching `resource_url` counts against the V1 limit; on
  `429`, back off using `X-Rate-Limit-Reset`.
- **Be idempotent.** V1 retry behavior is undocumented — dedupe on the fetched resource ID so a
  resent webhook isn't processed twice.
- **Ack fast.** Return `200` quickly; do the resource fetch and processing asynchronously if it may
  be slow, so ShipStation isn't left waiting.

## How to Debug Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every request rejected with 401 | `?token=` missing from `target_url`, or mismatch | Re-subscribe with the exact `?token=<SHIPSTATION_WEBHOOK_SECRET>` |
| `resource_url` fetch returns 401 | Wrong API key/secret, or not Base64 Basic auth | Use `Authorization: Basic base64(key:secret)` |
| Fetch intermittently fails with 429 | Exceeded 40 req/min per key | Back off using `X-Rate-Limit-Reset`; batch/queue fetches |
| Body has no order data | Working as intended — V1 payloads are thin | Fetch `resource_url` for the data |

## ShipStation API V2 (ShipEngine) — RSA-SHA256

If you are on the newer **V2 API** (`api.shipstation.com/v2`, docs.shipstation.com), deliveries **are**
signed with RSA-SHA256. Verify these headers instead:

- `x-shipengine-rsa-sha256-key-id` — key id to resolve against the JWKS
- `x-shipengine-rsa-sha256-signature` — the RSA-SHA256 signature over the payload
- `x-shipengine-timestamp` — delivery timestamp (reject stale)

Fetch the public keys from the JWKS at `https://api.shipengine.com/jwks`, select the key by `key-id`,
and verify the RSA-SHA256 signature over the raw body. ShipEngine gives a **10-second ack window** and
retries roughly **2× ~30 minutes apart**. This skill targets V1; V2 is a different product with
different events (`batch`, `track`, `rate`, `report_complete`, …).
