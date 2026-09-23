# How to Verify Quo Webhook Signatures

## Why There Are Two Schemes

Quo (formerly OpenPhone) runs two webhook generations side by side, and they
sign differently. Which one an endpoint receives depends on how the subscription
was created — you cannot choose at delivery time, and existing webhooks do not
migrate.

| | **Scheme A — current** | **Scheme B — legacy** |
|---|---|---|
| Subscription created with | `Quo-Api-Version: 2026-03-30` | legacy `/v1/webhooks/messages`, `/v1/webhooks/calls`, … |
| Headers | `webhook-id`, `webhook-timestamp`, `webhook-signature` | `openphone-signature` |
| Header syntax | `v1,<b64> v1,<b64>` — **space**-separated entries, each `version,sig` | `hmac;1;1639710054089;<b64>` — **semicolon**-separated, 4 fields |
| Multi-signature separator | space | comma (reserved for future use) |
| Algorithm | HMAC-SHA256 | HMAC-SHA256 |
| Digest encoding | standard base64 | standard base64 |
| Signed content | `{webhook-id}.{webhook-timestamp}.{raw-body}` | `{timestamp}.{raw-body}` |
| Timestamp unit | UNIX **seconds** | UNIX **milliseconds** (inferred) |
| Secret | `whsec_<base64>`, from `POST /webhooks` | bare base64, revealed in the app |
| Secret handling | strip `whsec_`, then base64-decode | base64-decode |
| Svix SDK works? | **yes** | **no** |

**Both** use HMAC-SHA256 with a **standard base64** digest — not base64url, not
hex — and **both sign the raw, unparsed request body bytes**.

Quo's support docs quote the legacy header value verbatim as:

```
'openphone-signature': 'hmac;1;1639710054089;mw1K4fvh5m9XzsGon4C5N3KvL0bkmPZSAyb/9Vms2Qo='
```

and the versioned docs state Scheme A verbatim as: "The signature is HMAC-SHA256
over `{webhook-id}.{webhook-timestamp}.{raw-body}`, encoded as base64."

## Scheme A — Current (Standard Webhooks / Svix-compatible)

### Manual verification

```javascript
const crypto = require('crypto');

const MAX_AGE_SECONDS = 300;  // the docs' own example uses 5 minutes

function verifyQuoSignature(rawBody, headers, key, maxAgeSeconds = MAX_AGE_SECONDS) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signature = headers['webhook-signature'];

  // Fail closed. A missing header or an unconfigured key is a rejection.
  if (!id || !timestamp || !signature || !key) return false;

  // webhook-timestamp is UNIX SECONDS. A real timestamp means a real replay
  // check is possible here — unlike providers that sign only the body.
  const ts = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > maxAgeSeconds) return false;

  // The whsec_ prefix is NOT part of the key. Strip it, then base64-DECODE.
  const secret = Buffer.from(String(key).replace(/^whsec_/, ''), 'base64');

  // Concatenate onto the RAW BODY BYTES. Never onto re-serialized JSON.
  const signed = Buffer.concat([
    Buffer.from(`${id}.${timestamp}.`, 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8'),
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('base64');

  // SPACE-separated `v1,<sig>` entries. Accept if ANY v1 entry matches, so
  // secret rotation and multi-sig deliveries keep working.
  return signature
    .split(' ')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      const idx = entry.indexOf(',');
      if (idx === -1) return false;
      if (entry.slice(0, idx) !== 'v1') return false;
      const provided = Buffer.from(entry.slice(idx + 1), 'utf8');
      const expectedBuf = Buffer.from(expected, 'utf8');
      // Length guard FIRST — timingSafeEqual throws on mismatched lengths.
      return provided.length === expectedBuf.length &&
        crypto.timingSafeEqual(provided, expectedBuf);
    });
}
```

```python
import base64, hashlib, hmac, time

MAX_AGE_SECONDS = 300

def verify_quo_signature(raw_body: bytes, headers, key, max_age_seconds=MAX_AGE_SECONDS) -> bool:
    webhook_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature = headers.get("webhook-signature")

    if not (webhook_id and timestamp and signature and key):
        return False  # fail closed

    try:
        ts = int(timestamp)  # UNIX SECONDS
    except (TypeError, ValueError):
        return False
    if abs(int(time.time()) - ts) > max_age_seconds:
        return False

    # Strip whsec_, then base64-DECODE to raw key bytes.
    secret = base64.b64decode(key[len("whsec_"):] if key.startswith("whsec_") else key)

    signed = f"{webhook_id}.{timestamp}.".encode("utf-8") + raw_body
    expected = base64.b64encode(hmac.new(secret, signed, hashlib.sha256).digest()).decode()

    # SPACE-separated `v1,<sig>` entries.
    for entry in signature.split(" "):
        version, _, provided = entry.strip().partition(",")
        if version == "v1" and provided and hmac.compare_digest(provided, expected):
            return True
    return False
```

### Using the Svix SDK instead

Quo's docs recommend Svix for Scheme A, and it works unchanged — it accepts the
`webhook-*` header names and the `whsec_`-prefixed key as-is, and enforces its
own timestamp tolerance.

```javascript
const { Webhook } = require('svix');   // npm i svix

const wh = new Webhook(process.env.QUO_WEBHOOK_KEY);  // whsec_… as-is
wh.verify(rawBody, {                                  // raw Buffer/string
  'webhook-id': req.headers['webhook-id'],
  'webhook-timestamp': req.headers['webhook-timestamp'],
  'webhook-signature': req.headers['webhook-signature'],
});
// Throws WebhookVerificationError on a bad signature or a stale timestamp.
// As of svix 2.x verify() returns undefined — parse the raw body after it passes.
const event = JSON.parse(rawBody.toString('utf8'));
```

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError   # pip install svix

wh = Webhook(os.environ["QUO_WEBHOOK_KEY"])
wh.verify(raw_body, {
    "webhook-id": headers["webhook-id"],
    "webhook-timestamp": headers["webhook-timestamp"],
    "webhook-signature": headers["webhook-signature"],
})  # raises WebhookVerificationError on failure
# As of svix 2.x verify() returns None — parse the raw body after it passes.
event = json.loads(raw_body)
```

Two things to know before adopting it:

- **svix 2.x `verify()` validates only.** It no longer returns the parsed
  payload in either SDK. Parse the raw body yourself afterwards — which is the
  correct order anyway: verify first, parse second.
- **The Node 2.x package is ESM-only** (`"type": "module"`, `engines: node >=22`).
  `require('svix')` works natively on Node ≥ 22.12, but Jest needs
  `--experimental-vm-modules`.

**Svix cannot verify Scheme B at all** — different header, format, signed
content and timestamp unit. Because a complete Quo handler has to implement the
legacy path by hand regardless, this skill's examples use one manual crypto path
for both generations: no dependency, no ESM constraint, and the algorithm stays
visible.

## Scheme B — Legacy (`openphone-signature`)

The header was **not renamed** during the OpenPhone → Quo rebrand. There is no
`quo-signature` header — do not invent one.

```javascript
const crypto = require('crypto');

function verifyQuoLegacySignature(rawBody, header, signingSecret, maxAgeSeconds = 300) {
  if (!header || !signingSecret) return false;  // fail closed

  // The signing secret is BASE64 with no prefix. Decode to raw bytes and pass
  // the BUFFER to createHmac — see the latin1 warning below.
  const key = Buffer.from(String(signingSecret), 'base64');
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

  // Quo: "Future versions may include multiple signatures separated by commas."
  // Note the separator is a COMMA here, unlike Scheme A's space.
  return String(header).split(',').some((part) => {
    // <scheme>;<version>;<timestamp>;<signature> — exactly 4 semicolon fields.
    const [scheme, version, timestamp, provided] = part.trim().split(';');
    if (scheme !== 'hmac' || version !== '1' || !timestamp || !provided) return false;
    if (!isFreshLegacyTimestamp(timestamp, maxAgeSeconds)) return false;

    // TWO parts — no webhook id, unlike Scheme A.
    const signed = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]);
    const expected = crypto.createHmac('sha256', key).update(signed).digest('base64');

    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

// Quo's docs never state the timestamp unit in words. The documented example
// value, 1639710054089, is 13 digits — UNIX MILLISECONDS. Detect the unit
// rather than hardcoding it, so a future switch to seconds doesn't break this.
function isFreshLegacyTimestamp(timestamp, maxAgeSeconds) {
  const n = Number(timestamp);
  if (!Number.isFinite(n) || n <= 0) return false;
  const ms = String(Math.trunc(n)).length >= 12 ? n : n * 1000;
  return Math.abs(Date.now() - ms) <= maxAgeSeconds * 1000;
}
```

```python
import base64, hashlib, hmac, time

def verify_quo_legacy_signature(raw_body: bytes, header, signing_secret, max_age_seconds=300) -> bool:
    if not header or not signing_secret:
        return False

    key = base64.b64decode(signing_secret)  # bare base64, no prefix

    # COMMA-separated (reserved for future multi-signature), then semicolons.
    for part in str(header).split(","):
        fields = part.strip().split(";")
        if len(fields) != 4:
            continue
        scheme, version, timestamp, provided = fields
        if scheme != "hmac" or version != "1" or not timestamp or not provided:
            continue
        if not _is_fresh_legacy_timestamp(timestamp, max_age_seconds):
            continue

        signed = f"{timestamp}.".encode("utf-8") + raw_body  # TWO parts
        expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
        if hmac.compare_digest(provided, expected):
            return True
    return False


def _is_fresh_legacy_timestamp(timestamp, max_age_seconds) -> bool:
    try:
        n = int(timestamp)
    except (TypeError, ValueError):
        return False
    if n <= 0:
        return False
    # 13 digits => milliseconds (the documented example, 1639710054089).
    ms = n if len(str(n)) >= 12 else n * 1000
    return abs(time.time() * 1000 - ms) <= max_age_seconds * 1000
```

## Common Gotchas

### The `whsec_` prefix is not part of the key (Scheme A)

`crypto.createHmac('sha256', 'whsec_abc…')` and `hmac.new(b'whsec_abc…', …)` are
bugs. Only the Svix SDK accepts the prefixed form. For manual verification:
strip `whsec_`, **then base64-decode** the remainder.

Storing the key *with* the prefix is correct — it is the stripping that has to
happen in code.

### The legacy secret is base64 too (Scheme B)

The value behind "Reveal signing secret" is base64-encoded. Decode it to raw
bytes before using it as an HMAC key. It is **not** your Quo API key.

### Legacy timestamps are milliseconds

The documented example is `1639710054089` — 13 digits, UNIX milliseconds.
Treating it as seconds puts every delivery roughly **52,000 years in the
future**, so a naive `abs(now - ts) > 300` check drops 100% of traffic while
looking like a signature problem.

**Honest caveat:** Quo's docs never state the unit in words. Milliseconds is
inferred from the 13-digit example. That is why the code above detects the unit
by digit count instead of hardcoding a divisor — it is correct either way.

Scheme A's `webhook-timestamp` genuinely is **seconds**; the docs' own example
compares against `Math.floor(Date.now() / 1000)` with a 5-minute window.

### Raw body vs re-serialized JSON — and the docs contradicting themselves

This is the single most load-bearing detail in Scheme B. Quo's own two samples
disagree:

```javascript
// Quo's Node sample — a RE-SERIALIZATION
const signedData = timestamp + '.' + JSON.stringify(req.body);
```

```python
# Quo's Python sample — the RAW BODY
signed_data_bytes = b''.join([timestamp.encode(), b'.', request.data])
```

`request.data` is the raw body. `JSON.stringify(req.body)` is a round-trip
through a parser. They agree **only** because Quo currently sends compact JSON
with no insignificant whitespace.

**Always use the raw body.** It is the safe superset, and Quo's own prose backs
it: "Remove all whitespace and newlines from JSON payload before concatenation".
Re-serializing breaks the instant anything reformats, reorders, or re-escapes
the payload — a proxy, a body-parser upgrade, a non-ASCII character escaped
differently. The versioned docs are blunt about the same requirement:
"If your middleware parses or rewrites the JSON body first, verification will
fail."

Framework specifics:

```javascript
// Express — raw() gives you a Buffer, not an object.
app.post('/webhooks/quo', express.raw({ type: 'application/json' }), handler);
```

```typescript
// Next.js App Router — read text first, parse second.
const rawBody = await request.text();
```

```python
# FastAPI — bytes first, parse second.
raw_body = await request.body()
```

### Quo's legacy Node sample corrupts non-ASCII keys

The docs' Node snippet does:

```javascript
// Do NOT copy this.
const signingKeyBinary = Buffer.from(signingKey, 'base64').toString('binary');
const hmac = crypto.createHmac('sha256', signingKeyBinary);
```

`.toString('binary')` is latin1. Handing that **string** to `createHmac` makes
Node re-encode it as UTF-8, which turns every key byte ≥ 0x80 into two bytes —
a silently wrong key and a signature that never matches.

Pass the **Buffer** directly:

```javascript
const key = Buffer.from(signingKey, 'base64');   // correct
crypto.createHmac('sha256', key);
```

This matches the Python sample's `base64.b64decode` exactly, and is
byte-identical to the docs' Node path for the ASCII-decoding keys Quo issues —
the docs' own example key decodes to `GfK3j4lXA5ZrRu64ofat50srGzoIHHUX`, pure
ASCII, which is why nobody has noticed. This skill does not reproduce the
`.toString('binary')` form.

### The separators differ between the two schemes

| | Multi-signature separator | Field separator |
|---|---|---|
| Scheme A | **space** | comma (`v1,<sig>`) |
| Scheme B | **comma** | semicolon (`hmac;1;ts;sig`) |

Swapping them fails silently — you get zero parsed candidate signatures and a
rejection that looks like a wrong secret.

Quo documents the legacy multi-signature case verbatim: "Future versions may
include multiple signatures separated by commas. Split the header value on
commas to handle multiple signatures if needed."

### `timingSafeEqual` throws on length mismatch

Node's `crypto.timingSafeEqual` raises if the two buffers differ in length — and
a wrong-length signature is exactly what an attacker or a misconfiguration
sends. Guard the length first (or catch), or the throw becomes a 500 and Quo
retries the delivery eight times.

Python's `hmac.compare_digest` handles differing lengths safely, but raises
`TypeError` on non-ASCII `str` inputs — compare the base64 strings (always
ASCII) or encode both sides to bytes.

### Header case

HTTP header names are case-insensitive, and Express, Next.js and FastAPI all
expose them lowercased. Quo documents them lowercase (`webhook-id`,
`openphone-signature`). Look them up in lowercase and you will be right
everywhere.

## Replay Protection

Unusually, **both** Quo schemes put a timestamp in the signed content, so a real
staleness check is possible on both — you do not have to fall back to
idempotency alone.

- **Scheme A:** `webhook-timestamp`, seconds, 5-minute window in the docs' own
  example.
- **Scheme B:** the timestamp field inside `openphone-signature`, milliseconds
  (inferred), same window is reasonable.

Pair the window with idempotency anyway, because Quo retries legitimately for up
to ~27h35m:

- **Scheme A:** deduplicate on the **`webhook-id` header** — unique per delivery
  and stable across retries. **Not** the envelope `id`, which identifies the
  *event* and is identical across every endpoint subscribed to it.
- **Scheme B:** there is no `webhook-id` header. Key on the envelope `id`, or on
  a hash of the raw body.

Retain processed ids for at least **28 hours** to cover the retry window.

## There Is No Handshake and No IP Allowlist

Quo sends **no** challenge, echo, or validation request when you register an
endpoint, and there is **no** `webhook.test` event type. The "Send Test Request"
button sends an ordinary, fully-signed delivery containing sample data — so your
verification has to work before the test passes, which is the point.

**No source-IP allowlist is documented.** Do not fabricate one. The HMAC is the
credential.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| Every delivery rejected, Scheme A | `whsec_` prefix not stripped, or the remainder not base64-decoded |
| Every delivery rejected, Scheme B | Signing secret not base64-decoded, or the API key used instead of the signing secret |
| Every delivery rejected as "stale", Scheme B | Milliseconds treated as seconds — ~52,000 years in the future |
| Works for ASCII bodies, fails for emoji/accents | Body re-serialized instead of raw, or the `.toString('binary')` key bug |
| Worked locally, fails behind a proxy | Middleware parsed/rewrote the JSON before you captured the bytes |
| Zero candidate signatures parsed | Split on the wrong separator — space vs comma between the schemes |
| Intermittent 500s in your logs | `timingSafeEqual` throwing on a length mismatch |
| Fails right after a rotation | Old secret still deployed; accept both during the overlap |

**Reproduce it offline.** Capture one real delivery's raw body and headers, then
compute the digest by hand and diff the two base64 strings. Quo's
`GET /webhooks/{webhookId}/events/{deliveryId}` (with
`Quo-Api-Version: 2026-03-30`) returns the exact request it sent, which makes
this a closed loop.

```bash
# Scheme A, by hand.
ID='msg_2abc'            # webhook-id header
TS='1745000000'          # webhook-timestamp header (seconds)
BODY='{"id":"EV123","type":"message.received"}'
KEY='whsec_c2VjcmV0'     # as stored

printf '%s.%s.%s' "$ID" "$TS" "$BODY" \
  | openssl dgst -sha256 -mac HMAC \
      -macopt "hexkey:$(printf '%s' "${KEY#whsec_}" | base64 -d | xxd -p -c 256)" \
      -binary | base64
# Compare with the v1,<sig> entry in webhook-signature.
```

Note `printf`, not `echo` — a trailing newline changes the digest.

## Official Documentation

- [Signature validation (2026-03-30)](https://www.quo.com/docs/2026-03-30/webhooks-signature-validation)
- [Webhooks overview (2026-03-30)](https://www.quo.com/docs/2026-03-30/webhooks-overview)
- [Support docs — Webhooks (legacy `openphone-signature`)](https://support.quo.com/core-concepts/integrations/webhooks)
