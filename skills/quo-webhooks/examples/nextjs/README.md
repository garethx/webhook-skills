# Quo Webhooks - Next.js Example

Minimal example of receiving **Quo** (quo.com — the business phone / VoIP
platform **formerly known as OpenPhone**) webhooks in a Next.js App Router
route handler, verifying **both** of Quo's signature schemes.

> **Not [Quoter](https://help.quoter.com).** Quoter is an unrelated CPQ /
> sales-quoting company using an **MD5** `hash` form field (not a header). Quo uses
> **HMAC-SHA256**. Different companies, different schemes.

## Two Schemes, One Endpoint

Quo runs two webhook generations side by side, and which one your endpoint
receives is decided by **how the subscription was created** — not by anything
you configure here. The route detects the scheme from the headers.

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
   cp .env.example .env.local
   ```

3. Add the signing secret for the scheme(s) your webhooks use:

   **Scheme A (current API).** The `key` field returned by
   `POST https://api.quo.com/webhooks` with `Quo-Api-Version: 2026-03-30`.
   Shown **once**, at creation. Store it exactly as returned, `whsec_` prefix
   included:
   ```bash
   QUO_WEBHOOK_KEY=whsec_...
   ```

   **Scheme B (legacy).** In the Quo app, open the webhook's details page →
   the **ellipses (⋯)** → **"Reveal signing secret"**. Bare base64, no prefix:
   ```bash
   QUO_LEGACY_SIGNING_SECRET=...
   ```

   Neither is your **Quo API key**. And neither gets a `NEXT_PUBLIC_` prefix —
   that would inline the secret into the client bundle.

## Run

```bash
npm run dev
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
not a special envelope. Your verification has to already work for it to pass.

## How It Works

1. **`await request.text()`** reads the raw body **before** anything parses it.
   Quo's docs: "If your middleware parses or rewrites the JSON body first,
   verification will fail." Never call `request.json()` before verifying.
2. **Scheme detection** from the headers.
3. **Verify** with `verifyQuoSignature` or `verifyQuoLegacySignature`.
4. **Parse** — only after verification passes.
5. **Respond 200** within Quo's 10-second budget. For slow work, enqueue and
   return rather than awaiting.

### No route segment config is needed

App Router route handlers receive the request unparsed. There is no
`bodyParser: false` to set — that was a Pages Router concern. Just read
`request.text()` first.

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
and drop stale events.

## Envelope Shapes

`normalizeEvent()` flattens both generations:

```ts
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

## Deploying

- **Vercel / Node runtime:** works as-is. The route uses `node:crypto`.
- **Edge runtime:** `node:crypto` is unavailable. Port the two verifier
  functions to Web Crypto (`crypto.subtle.importKey` + `sign`) and compare with
  a constant-time helper of your own.
- Set `QUO_WEBHOOK_KEY` / `QUO_LEGACY_SIGNING_SECRET` in your host's
  environment-variable settings, not in a committed `.env`.

## Events Handled

`message.received`, `message.delivered`, `message.failed`, `message.undelivered`,
`call.ringing`, `call.menu.selected`, `call.answered`, `call.completed`,
`call.forwarded`, `call.missed`, `call.recording.completed`,
`call.summary.completed`, `call.transcript.completed`,
`call.voicemail.completed`, `contact.updated`, `contact.deleted`, and all twelve
`task.*` events — plus the legacy aliases `task.due_date_changed` and
`task.due_date_removed`.
