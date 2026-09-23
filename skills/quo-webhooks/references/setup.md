# Setting Up Quo Webhooks

Quo is the business phone platform **formerly known as OpenPhone**. If you are
following an older tutorial that says "OpenPhone", the steps below are the same
feature under the new name. (This is not Quoter, the CPQ company.)

## Prerequisites

- A Quo workspace, with permission to manage integrations
- An HTTPS endpoint that can respond 2xx within 10 seconds
- For the API route: a Quo API key (Settings → API, or your workspace's
  developer settings)

**A workspace can have at most 50 webhooks.** Plan reuse rather than one webhook
per consumer.

## Decide Which Generation You Want

This is the decision that determines everything else, including which signature
scheme your handler must implement.

| | **Current (recommended)** | **Legacy** |
|---|---|---|
| Create via | `POST /webhooks` with `Quo-Api-Version: 2026-03-30` | The in-app webhook UI, or the legacy `/v1/webhooks/messages` etc. |
| Signature | `webhook-id` / `webhook-timestamp` / `webhook-signature` | `openphone-signature` |
| Secret | returned as `key`, `whsec_…` | revealed in the app, bare base64 |
| Events | The full 28-event list | A subset, plus `task.due_date_changed` / `task.due_date_removed` |

**New integrations should use the versioned API.** It has more events, richer
context, a Svix-compatible signature, and a per-delivery `webhook-id` you can
use as an idempotency key.

**Existing webhooks do not migrate themselves.** A webhook created before you
adopted the versioned API keeps sending the legacy format and the legacy header
forever. If you have both, your handler needs both paths — see
[verification.md](verification.md).

## Route A — Create a Webhook via the API (current generation)

```bash
curl -X POST https://api.quo.com/webhooks \
  -H "Authorization: $QUO_API_KEY" \
  -H "Quo-Api-Version: 2026-03-30" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.example.com/webhooks/quo",
    "events": ["message.received", "message.delivered", "call.completed"],
    "resourceIds": ["*"],
    "label": "Production handler"
  }'
```

Request fields:

| Field | Notes |
|---|---|
| `url` | Your HTTPS endpoint |
| `events` | At least one. See the full list in [overview.md](overview.md) |
| `resourceIds` | Optional; defaults to `["*"]`. Either phone number ids matching `^PN.*$`, or the single wildcard `["*"]`. Filters **activity** events only — contact events are always org-wide |
| `label` | Optional human-readable name |

The `201` response object carries `id`, `orgId`, `label`, `status`
(`enabled`/`disabled`), `url`, `createdAt`, `updatedAt`, `apiVersion`, `events`,
`resourceIds` — and:

```json
{ "key": "whsec_exampleSecret" }
```

### Store `key` immediately

`key` is the **signing secret**. Copy it into your secret store on the spot.
(Quo's docs say only "Save the `key` field from the response" and don't state
whether it can be re-read later — so treat it as create-time-only. If you lose
it, rotate rather than guess.)

Store it **exactly as returned, including the `whsec_` prefix**. Your code
strips the prefix and base64-decodes the remainder at verification time; the
Svix SDK takes the prefixed form as-is. Either way, the value you save is the
full `whsec_…` string.

```bash
QUO_WEBHOOK_KEY=whsec_c2VjcmV0
```

### Other management endpoints

All of these are on the **versioned** surface, so send
`Quo-Api-Version: 2026-03-30` and note there is **no `/v1` prefix** — the
version is a header, not a path segment. (`/v1/...` paths belong to the legacy
generation.)

| Operation | Endpoint |
|---|---|
| List webhooks | `GET /webhooks` |
| Get one | `GET /webhooks/{webhookId}` |
| Update | `PATCH /webhooks/{webhookId}` |
| Delete | `DELETE /webhooks/{webhookId}` |
| Rotate the signing secret | `POST /webhooks/{webhookId}/rotate` |
| Send a test event | `POST /webhooks/{webhookId}/events/test` |
| List deliveries | `GET /webhooks/{webhookId}/events` |
| Get a delivery | `GET /webhooks/{webhookId}/events/{deliveryId}` |
| Retry a delivery | `POST /webhooks/{webhookId}/events/{deliveryId}/retry` |

Delivery listing takes a `resourceId` filter, so you can find every delivery
tied to one business object. Quo records that correlation data only from
**2 September 2026** — older deliveries return `null` for `eventId` and
`resourceId`, and so do test deliveries.

The delivery endpoints are the fastest way to debug: they show you the exact
request Quo sent and the response it got back.

## Route B — Create a Webhook in the Quo App

1. **Settings → Webhooks**
2. **Create webhook**
3. Enter your handler URL (HTTPS)
4. Choose the event types to subscribe to
5. Choose the resources — phone numbers for activity events, or contacts
6. Optionally add a label
7. **Save**

### Get the legacy signing secret

For a webhook created this way, the signing secret lives behind a menu:

1. Open the webhook's details page
2. Click the **ellipses (⋯)**
3. Select **"Reveal signing secret"**

What you get is a **base64-encoded string with no prefix**. Your code must
**base64-decode it to raw bytes** before using it as the HMAC key.

```bash
QUO_LEGACY_SIGNING_SECRET=R2ZLM2o0bFhBNVpyUnU2NG9mYXQ1MHNyR3pvSUhIVVg=
```

**This is not your Quo API key.** The API key authenticates *you calling Quo*;
the signing secret verifies *Quo calling you*. They are different values with
different lifetimes — never substitute one for the other.

## There Is No Verification Handshake

Quo does **not** send a challenge, echo, or validation request when you register
an endpoint. There is nothing to echo back and no `hub.challenge`-style
parameter. Save the webhook and deliveries begin.

## Testing: "Send Test Request"

Both the app (a **Send Test Request** button) and the API
(`POST /webhooks/{webhookId}/events/test`) will send a sample payload of an event
type you choose.

**It is an ordinary, fully-signed delivery.** Same headers, same signature, same
envelope — just sample data in the body. Consequences:

- Your signature verification must already work, or the test will fail exactly
  as a real event would. That is the point of it.
- There is **no `webhook.test` event type**, no unsigned ping, and no special
  envelope. Do not add a branch for one.

## Local Development

```bash
npx hookdeck-cli listen 3000 quo --path /webhooks/quo
```

No install and no account needed — the CLI creates a guest account on first run,
prints a public HTTPS URL, and gives you a web UI for inspecting every request
and response.

1. Run the command above (use `8000` for the FastAPI example).
2. Copy the printed HTTPS URL.
3. Use it as the webhook `url` in the app or in `POST /webhooks`.
4. Hit **Send Test Request**, or send yourself a text at a subscribed number.
5. Inspect the delivery — headers included — in the CLI's web UI.

Because the signature covers the raw body and nothing URL-specific, a delivery
tunnelled to localhost verifies exactly as it would in production.

## Going to Production

1. Update the webhook's `url` to your production endpoint (`PATCH /webhooks/{webhookId}`,
   or edit it in the app).
2. Put the signing secret in your production secret store — a rotated or
   re-created webhook has a **different** secret.
3. Confirm your handler returns 2xx in well under 10 seconds. Verify, enqueue,
   respond; do the real work afterwards.
4. Make handling idempotent on the **`webhook-id` header**, retained 28+ hours.
5. Alert on repeated non-2xx responses — Quo gives up about **27h35m** after the
   first attempt, and the events are gone after that.

### Rotating the secret

```bash
curl -X POST https://api.quo.com/webhooks/$WEBHOOK_ID/rotate \
  -H "Authorization: $QUO_API_KEY" \
  -H "Quo-Api-Version: 2026-03-30"
```

Deploy the new secret before you rotate, and accept **either** secret during the
overlap — verify against the old key if the new one fails. Both examples'
verifier functions take the key as an argument precisely so you can try two.

## Environment Variables

```bash
# Scheme A — current API (Quo-Api-Version: 2026-03-30).
# The `key` from POST /webhooks. Keep the whsec_ prefix.
QUO_WEBHOOK_KEY=whsec_c2VjcmV0

# Scheme B — legacy webhooks only. App -> webhook -> (...) -> Reveal signing
# secret. Bare base64, no prefix. NOT the API key.
QUO_LEGACY_SIGNING_SECRET=R2ZLM2o0bFhBNVpyUnU2NG9mYXQ1MHNyR3pvSUhIVVg=
```

Set only the ones you need. The examples fail closed: a delivery whose scheme
has no configured secret is rejected, never accepted unverified.

## Official Documentation

- [Webhooks overview (2026-03-30)](https://www.quo.com/docs/2026-03-30/webhooks-overview)
- [Webhooks quickstart](https://www.quo.com/docs/2026-03-30/webhooks-quickstart)
- [Signature validation](https://www.quo.com/docs/2026-03-30/webhooks-signature-validation)
- [Support docs — Webhooks (legacy)](https://support.quo.com/core-concepts/integrations/webhooks)
