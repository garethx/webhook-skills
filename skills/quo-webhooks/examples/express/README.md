# Quo Webhooks - Express Example

Minimal example of receiving **Quo** (quo.com — the business phone / VoIP
platform **formerly known as OpenPhone**) webhooks in Express, verifying **both**
of Quo's signature schemes.

> **Not [Quoter](https://help.quoter.com).** Quoter is an unrelated CPQ /
> sales-quoting company using an **MD5** `hash` form field (not a header). Quo uses
> **HMAC-SHA256**. Different companies, different schemes.

## Two Schemes, One Endpoint

Quo runs two webhook generations side by side, and which one your endpoint
receives is decided by **how the subscription was created** — not by anything
you configure here. This handler detects the scheme from the headers and
verifies accordingly.

| | **Scheme A — current** | **Scheme B — legacy** |
|---|---|---|
| Headers | `webhook-id`, `webhook-timestamp`, `webhook-signature` | `openphone-signature` |
| Signed content | `{webhook-id}.{webhook-timestamp}.{raw-body}` | `{timestamp}.{raw-body}` |
| Timestamp | UNIX **seconds** | UNIX **milliseconds** |
| Secret | `whsec_<base64>` → strip prefix, base64-decode | bare base64 → base64-decode |
| Env var | `QUO_WEBHOOK_KEY` | `QUO_LEGACY_SIGNING_SECRET` |

Both are HMAC-SHA256 with a **standard base64** digest over the **raw body**.

## Prerequisites

- Node.js 18+
- A Quo workspace with a webhook configured, and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing secret for the scheme(s) your webhooks use:

   **Scheme A (current API).** The `key` field returned by
   `POST https://api.quo.com/webhooks` with `Quo-Api-Version: 2026-03-30`.
   It is shown **once**, at creation. Store it exactly as returned, `whsec_`
   prefix included:
   ```bash
   QUO_WEBHOOK_KEY=whsec_...
   ```

   **Scheme B (legacy).** In the Quo app, open the webhook's details page →
   the **ellipses (⋯)** → **"Reveal signing secret"**. Bare base64, no prefix:
   ```bash
   QUO_LEGACY_SIGNING_SECRET=...
   ```

   Neither is your **Quo API key** — that authenticates you calling Quo; these
   verify Quo calling you.

## Run

```bash
npm start
```

Server runs on `http://localhost:3000`.

Webhook endpoint: `POST http://localhost:3000/webhooks/quo`

## Test

```bash
npm test
```

27 tests covering both schemes: valid and tampered signatures, wrong keys,
stale timestamps, multi-signature headers (spaces for Scheme A, commas for
Scheme B), the `whsec_` prefix bug, the undecoded-secret bug, the
milliseconds-vs-seconds trap, the length guard on `timingSafeEqual`, non-ASCII
bodies, re-serialized bodies, and both envelope shapes.

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 quo --path /webhooks/quo
```

No account, no install required — the CLI creates a guest account on first run
and gives you a public HTTPS URL plus a web UI for inspecting requests. Paste
the printed URL into the webhook's URL field in Quo, then hit **Send Test
Request**.

That button sends a **normal, fully-signed delivery** of a real event type —
not a special envelope. Your verification has to already work for it to pass,
which is the point of it.

### Sign a request by hand

Scheme A (note `printf`, not `echo` — a trailing newline changes the digest):

```bash
ID='msg_2abc'
TS=$(date +%s)                      # UNIX SECONDS
BODY='{"id":"EV123","apiVersion":"2026-03-30","type":"message.received","data":{"resource":{},"context":{"orgId":"OR123"},"links":{}}}'
KEY='whsec_...'                     # as stored, prefix included

SIG=$(printf '%s.%s.%s' "$ID" "$TS" "$BODY" \
  | openssl dgst -sha256 -mac HMAC \
      -macopt "hexkey:$(printf '%s' "${KEY#whsec_}" | base64 -d | xxd -p -c 256)" \
      -binary | base64)

curl -X POST http://localhost:3000/webhooks/quo \
  -H "Content-Type: application/json" \
  -H "webhook-id: $ID" \
  -H "webhook-timestamp: $TS" \
  -H "webhook-signature: v1,$SIG" \
  -d "$BODY"
```

Scheme B:

```bash
TS=$(($(date +%s) * 1000))          # UNIX MILLISECONDS
BODY='{"id":"EV1","object":"event","apiVersion":"v2","type":"message.received","data":{"object":{"body":"Hello"}}}'
SECRET='...'                        # bare base64 from "Reveal signing secret"

SIG=$(printf '%s.%s' "$TS" "$BODY" \
  | openssl dgst -sha256 -mac HMAC \
      -macopt "hexkey:$(printf '%s' "$SECRET" | base64 -d | xxd -p -c 256)" \
      -binary | base64)

curl -X POST http://localhost:3000/webhooks/quo \
  -H "Content-Type: application/json" \
  -H "openphone-signature: hmac;1;$TS;$SIG" \
  -d "$BODY"
```

## How It Works

1. **`express.raw({ type: 'application/json' })`** gives the handler the exact
   bytes Quo sent. Quo's docs: "If your middleware parses or rewrites the JSON
   body first, verification will fail." Never mount `express.json()` ahead of
   this route.
2. **Scheme detection** from the headers, before anything is parsed.
3. **Verify** with `verifyQuoSignature` or `verifyQuoLegacySignature`.
4. **Parse** — only after verification passes.
5. **Respond 200 immediately**, then process in `setImmediate`. Quo's budget is
   **10 seconds**.

## Security

- HMAC-SHA256, **standard base64** digest (not base64url, not hex), over the
  **raw body bytes** in both schemes
- Both secrets are **base64-decoded to raw bytes** before use; the `whsec_`
  prefix is stripped first for Scheme A
- Replay windows on **both** schemes — unusual, and possible because both sign a
  timestamp. Default 300s via `QUO_MAX_AGE_SECONDS`
- Constant-time comparison with a **length guard first**, because
  `crypto.timingSafeEqual` throws on mismatched lengths and an uncaught throw
  becomes a 500 that Quo retries eight times
- **Fails closed**: an unconfigured secret returns `500`, never a silent accept.
  A missing signature header returns `400`
- Multi-signature support: **spaces** between `v1,<sig>` entries in Scheme A,
  **commas** between entries in Scheme B. Any matching entry is accepted, so
  secret rotation works
- **No source-IP allowlist is documented** by Quo — the HMAC is the credential

## Idempotency and Ordering

**Deduplicate on the `webhook-id` header, not the envelope `id`.** The envelope
`id` identifies the **event**; every endpoint subscribed to it receives the same
value. The header is unique per delivery and stable across retries. Legacy
deliveries have no such header — fall back to the envelope `id`.

Retain processed keys for **at least 28 hours**: Quo retries 8 times over
roughly **27h35m** (immediate, +5s, +5m, +30m, +2h, +5h, +10h, +10h).

**Ordering is not guaranteed**, including within a single resource — a
`call.transcript.completed` can arrive before the matching
`call.summary.completed`. Compare `data.resource.updatedAt` against stored state
and drop stale events rather than driving a state machine off arrival order.

## Envelope Shapes

The handler normalises both generations in `normalizeEvent()`:

```js
// Current (apiVersion "2026-03-30")
{ data: { resource: {...}, context: { orgId: "OR123" }, links: { quo: "..." } } }

// Legacy (apiVersion "v2" / "v3")
{ object: "event", data: { object: {...} } }
```

Field names differ too: legacy uses `body`/`from`/`to`, current uses
`resource.text` and `context.senderIdentifier`/`context.recipientIdentifiers`.

**`unavailable` means unknown, not empty.** `context.contacts.lookupStatus` is
`matched` | `none` | `unavailable`, and `context.participants.resolution` is
`available` | `unavailable`. Only `none` means "we looked and found nothing".

## Events Handled

`message.received`, `message.delivered`, `message.failed`, `message.undelivered`,
`call.ringing`, `call.menu.selected`, `call.answered`, `call.completed`,
`call.forwarded`, `call.missed`, `call.recording.completed`,
`call.summary.completed`, `call.transcript.completed`,
`call.voicemail.completed`, `contact.updated`, `contact.deleted`, and all twelve
`task.*` events — plus the legacy aliases `task.due_date_changed` and
`task.due_date_removed`, which the underscore-free versioned names replaced.
