# Quo Webhooks - FastAPI Example

Minimal example of receiving **Quo** (quo.com — the business phone / VoIP
platform **formerly known as OpenPhone**) webhooks in FastAPI, verifying
**both** of Quo's signature schemes.

> **Not [Quoter](https://help.quoter.com).** Quoter is an unrelated CPQ /
> sales-quoting company using an **MD5** `X-Quoter-Signature`. Quo uses
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
| Multi-signature separator | **space** | **comma** |
| Secret | `whsec_<base64>` → strip prefix, base64-decode | bare base64 → base64-decode |
| Env var | `QUO_WEBHOOK_KEY` | `QUO_LEGACY_SIGNING_SECRET` |

Both are HMAC-SHA256 with a **standard base64** digest over the **raw body**.

## Prerequisites

- Python 3.9+
- A Quo workspace with a webhook configured, and its signing secret

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
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
python main.py
```

Or with uvicorn directly:

```bash
uvicorn main:app --reload --port 8000
```

Server runs on `http://localhost:8000`.

Webhook endpoint: `POST http://localhost:8000/webhooks/quo`

## Test

```bash
pytest test_webhook.py -v
```

34 tests covering both schemes: valid and tampered signatures, wrong keys,
stale timestamps, multi-signature headers (spaces for Scheme A, commas for
Scheme B), the `whsec_` prefix bug, the undecoded-secret bug, the
milliseconds-vs-seconds trap, malformed headers, non-ASCII bodies,
re-serialized bodies, fail-closed configuration, and both envelope shapes.

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 quo --path /webhooks/quo
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

curl -X POST http://localhost:8000/webhooks/quo \
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

curl -X POST http://localhost:8000/webhooks/quo \
  -H "Content-Type: application/json" \
  -H "openphone-signature: hmac;1;$TS;$SIG" \
  -d "$BODY"
```

## How It Works

1. **`await request.body()`** reads the exact bytes Quo sent, before anything
   parses them. Quo's docs: "If your middleware parses or rewrites the JSON
   body first, verification will fail." Never call `await request.json()` — or
   declare a Pydantic request model — ahead of verification.
2. **Scheme detection** from the headers, before anything is parsed.
3. **Verify** with `verify_quo_signature` or `verify_quo_legacy_signature`.
4. **Parse** — only after verification passes.
5. **Respond 200 immediately** via `BackgroundTasks`. Quo's budget is
   **10 seconds**.

## FastAPI Notes

- The handler takes `Request` directly rather than a Pydantic model. A declared
  model would consume and re-serialize the body, destroying the bytes the
  signature covers — and the two envelope generations don't share a schema.
- `request.headers` is already case-insensitive in Starlette, so the lowercase
  names Quo documents work as written.
- `BackgroundTasks` runs `handle_event` after the response is sent, which keeps
  the acknowledgement inside the 10-second budget.
- Returning `Response` with an explicit status for failures keeps the error
  body shape identical across the 400 and 500 paths.

## Security

- HMAC-SHA256, **standard base64** digest (not base64url, not hex), over the
  **raw body bytes** in both schemes
- Both secrets are **base64-decoded to raw bytes** before use; the `whsec_`
  prefix is stripped first for Scheme A. Passing `whsec_...` straight into
  `hmac.new` is the single most common Scheme A bug — only the Svix SDK accepts
  the prefixed form as-is
- Replay windows on **both** schemes — unusual, and possible because both sign
  a timestamp. Default 300s via `QUO_MAX_AGE_SECONDS`
- `hmac.compare_digest` for constant-time comparison. Both sides are base64,
  hence ASCII, so its non-ASCII `str` `TypeError` cannot be triggered here
- **Fails closed**: an unconfigured secret returns `500`, never a silent accept.
  A missing signature header returns `400`
- Multi-signature support: **spaces** between `v1,<sig>` entries in Scheme A,
  **commas** between entries in Scheme B. Any matching entry is accepted, so
  secret rotation works
- **No source-IP allowlist is documented** by Quo — the HMAC is the credential

### Two sourcing notes

**The legacy timestamp unit is inferred.** Quo's docs never state it in words;
the documented example value `1639710054089` is 13 digits, i.e. milliseconds.
Reading it as seconds would put every delivery ~52,000 years in the future and
silently drop all traffic. `is_fresh_legacy_timestamp` detects the unit by digit
count rather than hardcoding a divisor, so it is correct either way.

**Quo's own Node sample has two bugs this example avoids.** It signs
`JSON.stringify(req.body)` — a re-serialization that matches only because Quo
sends compact JSON — where the Python sample signs `request.data`, the raw
bytes. And it passes `Buffer.from(key,'base64').toString('binary')` to
`createHmac`, a latin1 string Node then re-encodes as UTF-8, corrupting any key
byte `>= 0x80`. This example follows the **Python** sample: raw body bytes, and
`base64.b64decode` to raw key bytes.

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

The handler normalises both generations in `normalize_event()`:

```python
# Current (apiVersion "2026-03-30")
{"data": {"resource": {...}, "context": {"orgId": "OR123"}, "links": {"quo": "..."}}}

# Legacy (apiVersion "v2" / "v3")
{"object": "event", "data": {"object": {...}}}
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
