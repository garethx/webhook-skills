# How to Verify Azure Event Grid Webhooks

## There Is No Signature. Do Not Write an HMAC Verifier.

Azure Event Grid does **not** sign the request body.

- No `X-Signature`, no `X-Event-Grid-Signature`, no Standard Webhooks
  (`webhook-id` / `webhook-timestamp` / `webhook-signature`).
- No HMAC, no shared signing secret, no timestamp+signature pair, no asymmetric
  signature of any kind.
- **Any `verify()` that calls `crypto.createHmac` / `hmac.new` over the request
  body for Event Grid is fabricated.** If you find one in generated code, delete
  it — it is verifying nothing.

Because nothing is signed, there is no raw-body requirement either. Parsing JSON
before authenticating is safe here in a way it never is for Stripe or Shopify.

> **Hookdeck source config note.** Hookdeck's `AZURE_EVENT_GRID` source offers a
> choice of HMAC / Basic Auth / API Key / nothing. That is a *configurable-auth*
> source: Event Grid lets you attach up to 10 arbitrary static HTTP headers to
> deliveries, so the API-Key and Basic-Auth options map onto a header **you**
> chose. Nothing in Azure computes an HMAC over the payload.

## What Actually Establishes Trust

| Layer | When | What it proves |
|-------|------|----------------|
| Ownership handshake | Once, at subscription create/update | You own the endpoint **and** you recognise the subscription |
| Channel authentication | Every delivery | The caller presented a credential you configured |

Channel authentication has three supported forms: a static delivery-property
header, a client secret carried in a query parameter of the endpoint URL, or a
Microsoft Entra ID bearer token.

You need both. The handshake alone stops a stranger registering your URL as a
delivery target; it does nothing about someone replaying requests at your URL
afterwards. The docs say so plainly: *"Even after that correct handshake
implementation, a bad actor can flood your app (it already validated the event
subscription) by replicating a request that seems to be coming from Event Grid.
To prevent that, you must secure your webhook with Microsoft Entra
authentication."*

## Handshake A — SubscriptionValidationEvent (Event Grid schema)

Fires when the event subscription's delivery schema is **Event Grid schema**.

Request:

- Method `POST`, header `aeg-event-type: SubscriptionValidation`
- Header `aeg-subscription-name` carries the event subscription's name
- Body is a JSON **array** containing exactly the one validation event:
  *"The array contains only the validation event. Other events are sent in a
  separate request after you echo back the validation code."*

```json
[
  {
    "id": "2d1781af-3a4c-4d7c-bd0c-e34b19da4e66",
    "topic": "/subscriptions/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "subject": "",
    "data": {
      "validationCode": "512d38b6-c7b8-40c8-89fe-f46f9e9622b6",
      "validationUrl": "https://rp-eastus2.eventgrid.azure.net:553/eventsubscriptions/myeventsub/validate?id=0000000000-0000-0000-0000-00000000000000&t=2022-10-28T04:23:35.1981776Z&apiVersion=2018-05-01-preview&token=1A1A1A1A"
    },
    "eventType": "Microsoft.EventGrid.SubscriptionValidationEvent",
    "eventTime": "2022-10-28T04:23:35.1981776Z",
    "metadataVersion": "1",
    "dataVersion": "1"
  }
]
```

Response — a single JSON **object** (not an array) echoing
`data.validationCode`:

```json
{ "validationResponse": "512d38b6-c7b8-40c8-89fe-f46f9e9622b6" }
```

Rules:

- **HTTP 200 OK is required.** *"**HTTP 202 Accepted** isn't recognized as a
  valid Event Grid subscription validation response."* This is the one place
  where 202 — normally a success code for Event Grid deliveries — is wrong.
- The HTTP request must complete **within 30 seconds**. Otherwise it is
  cancelled and reattempted after 5 seconds; repeated failure is a validation
  handshake error.
- Field name casing: the canonical Azure TypeSpec model
  (`SubscriptionValidationResponse` in
  `specification/eventgrid/data-plane/EventGridSystemEvents/Microsoft.EventGrid/EventGrid.tsp`)
  uses camelCase `validationResponse`, and that is what the validation doc
  shows. Microsoft's own C#/JS samples on the *receive events* page emit
  PascalCase `ValidationResponse`. The docs don't state whether matching is
  case-sensitive, so use the documented camelCase form; just don't be surprised
  when a Microsoft sample looks different.

### The identity guard is the point

Echoing the code to anyone who asks defeats the purpose. The docs:
*"your correct implementation of the validation request event checks for the
`aeg-subscription-name` header in the request to ascertain that it's an event
subscription that you recognize."* And: *"if you identify that it isn't an event
subscription for which you're expecting events, don't return a 200 response or
return no response at all. Hence, the validation fails."*

So keep an allowlist of subscription names you created, and **withhold** the
echo for anything else. Without this check, an attacker who learns your URL can
create their own topic and subscription pointing at you and then flood you with
events — exactly the DoS the handshake exists to prevent.

### Asynchronous (manual) handshake

If you return 200 but don't echo the code synchronously, the subscription moves
to provisioning state `AwaitingManualAction`. GET the `validationUrl` from the
event data **within 10 minutes** to complete it; after that the state becomes
`Failed` and the subscription must be created again. The validation URL uses
**port 553** — a firewall blocking 553 breaks the manual handshake.

This path exists for services that can't respond programmatically (the docs name
Zapier and IFTTT). If you control the code, do the synchronous echo.

Self-signed certificates are not supported for validation; use a CA-signed one.

## Handshake B — CloudEvents v1.0 Abuse Protection (CloudEvents schema)

Fires **instead of** Handshake A when the delivery schema is CloudEvents v1.0.
It is a different handshake, not an extra one.

- Method is **HTTP OPTIONS**, against the exact resource target URI being
  registered.
- Request header **`WebHook-Request-Origin`** MUST be present, carrying a DNS
  name identifying the sending system (e.g. `eventemitter.example.com`).
- To consent, reply with **`WebHook-Allowed-Origin`**, whose value MUST be
  either the origin from `WebHook-Request-Origin` or a single `*`. The grant
  also names **`WebHook-Allowed-Rate`** (permitted requests per minute). The
  response SHOULD include an `Allow` header indicating POST is permitted.
- **Consent is signalled by the headers, not by the status code**: *"the
  handshake can't rely on status codes."* To refuse, withhold the headers. An
  endpoint that doesn't support OPTIONS SHOULD return 405.
- After the grant, the sender MUST send the `Origin` request header on each
  delivery, matching the allowed origin.

Do not oversell this one. Verbatim: *"the handshake doesn't aim to establish an
authentication or authorization context. It only serves to protect the sender
from being told to a push to a destination that isn't expecting the traffic."*

```javascript
function handleAbuseProtection(requestOrigin, allowedOrigins) {
  if (!requestOrigin) return { status: 400, headers: {} };
  const allowed =
    allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin.toLowerCase());
  // Refusal = withhold the grant headers. The status code is not the signal.
  if (!allowed) return { status: 403, headers: {} };
  return {
    status: 200,
    headers: {
      'WebHook-Allowed-Origin': requestOrigin,
      'WebHook-Allowed-Rate': '120',
      Allow: 'POST, OPTIONS',
    },
  };
}
```

## Channel Authentication A — Static Delivery Property Header

The practical shared-secret path. You configure a custom header on the event
subscription (see [setup.md](setup.md)) and compare it server-side.

```javascript
const crypto = require('crypto');

function checkDeliverySecret(received, expected) {
  // Fail CLOSED: an unset expected secret must never mean "accept anything".
  if (!expected) return false;
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so length-check first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

```python
import hmac

def check_delivery_secret(received: str | None, expected: str | None) -> bool:
    # Fail CLOSED: an unset expected secret must never mean "accept anything".
    if not expected:
        return False
    return hmac.compare_digest((received or "").encode(), expected.encode())
```

`hmac.compare_digest` is used here purely as a constant-time string comparison —
there is no HMAC being computed, because Event Grid signs nothing.

Constraints: up to 10 custom headers per subscription, each value at most 4,096
bytes. Never use the reserved `aeg-` prefix for the header name.

## Channel Authentication B — Client Secret as a Query Parameter

[Authenticate event delivery](https://learn.microsoft.com/en-us/azure/event-grid/security-authentication)
lists this alongside Entra ID as a supported method for webhook handlers. The
secret lives in the subscription's endpoint URL, and *"Event Grid service
includes all the query parameters in every event delivery request to the
webhook."*

Azure stores these encrypted, keeps them out of service logs and traces, and
omits them when you read the subscription back unless you pass
`--include-full-endpoint-url`.

**Accept a list, not a value.** The docs require an overlap window during
rotation: *"make the webhook accept both old and new secrets for a limited
duration before updating the event subscription with the new secret."*

```javascript
function checkAgainstAny(received, expectedCsv) {
  const accepted = String(expectedCsv || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (accepted.length === 0) return false;   // Fail CLOSED.
  // Reduce without an early return so timing doesn't reveal which one matched.
  return accepted.reduce((hit, c) => checkDeliverySecret(received, c) || hit, false);
}
```

Two traps:

- **Don't lowercase the accepted list.** Secrets are case-sensitive. If you
  reuse the same `parseList` helper that normalises `aeg-subscription-name`,
  case-folding will quietly break secret comparison — and the failure looks like
  a wrong secret, not a bug.
- **Don't short-circuit the loop.** Returning on the first match leaks, through
  timing, which secret in the rotation set was presented.

## Channel Authentication C — Microsoft Entra ID Bearer Token

When the subscription is configured with `--azure-active-directory-tenant-id`
and `--azure-active-directory-application-id-or-uri`, *"Event Grid is now
passing the Microsoft Entra bearer token to the webhook client in every message.
You need to validate the authorization token in your webhook."*

The token arrives in the standard `Authorization` header as a bearer token, and
you validate it as an ordinary Entra-issued JWT against your own application:
audience = the configured application ID or Application ID URI, issuer = the
configured tenant.

**Hedge honestly**: the Event Grid docs state that the token is passed and must
be validated, but they do **not** print a sample `Authorization` header or the
token's claim set. What follows is the standard Entra validation pattern, not a
transcription of a documented Event Grid token. Do not invent an audience GUID,
and do not hard-code claim values Microsoft hasn't published.

### Node.js — `jsonwebtoken` + `jwks-rsa`

```javascript
const jwt = require('jsonwebtoken');
const { JwksClient } = require('jwks-rsa');

const client = new JwksClient({
  jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_EVENT_GRID_ENTRA_TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

async function verifyEntraToken(authorizationHeader, { tenantId, audience }) {
  // RFC 9110: the auth scheme is case-insensitive.
  const [scheme, token] = String(authorizationHeader || '').split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;

  const decoded = jwt.decode(token.trim(), { complete: true });
  if (!decoded?.header?.kid) return null;

  try {
    const key = (await client.getSigningKey(decoded.header.kid)).getPublicKey();
    return jwt.verify(token.trim(), key, {
      algorithms: ['RS256'],
      audience, // your application ID or Application ID URI
      // Entra issues v2.0 and v1.0 issuer forms; accept the pair for your tenant.
      issuer: [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://sts.windows.net/${tenantId}/`,
      ],
    });
  } catch {
    return null; // bad signature, wrong aud/iss, expired
  }
}
```

### Python — PyJWT + `PyJWKClient`

```python
import jwt
from jwt import PyJWKClient

_jwks = PyJWKClient(
    f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys",
    cache_keys=True,
)

def verify_entra_token(authorization_header, tenant_id, audience):
    scheme, _, token = (authorization_header or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    token = token.strip()
    try:
        key = _jwks.get_signing_key_from_jwt(token).key
    except Exception:
        return None
    for issuer in (
        f"https://login.microsoftonline.com/{tenant_id}/v2.0",
        f"https://sts.windows.net/{tenant_id}/",
    ):
        try:
            return jwt.decode(
                token, key, algorithms=["RS256"], audience=audience, issuer=issuer
            )
        except jwt.InvalidIssuerError:
            continue
        except Exception:
            return None
    return None
```

Always pin `algorithms=['RS256']`. Never call `jwt.decode` without verification
and never accept `alg: none`.

## Common Gotchas

- **Looking for a signature header.** There isn't one. Stop searching the docs.
- **Returning 202 to the validation event.** Explicitly rejected. Return 200.
  (202 *is* a valid ack for ordinary deliveries — the rule differs by request.)
- **Echoing the code to any caller.** Gate on `aeg-subscription-name` first.
- **Parsing the body as an object in Event Grid schema.** It is an **array** —
  loop it. Batching can put up to 5,000 events in it.
- **Parsing the body as an array in CloudEvents schema.** Structured-mode
  CloudEvents is a **single object**. Normalise both shapes.
- **Implementing only one handshake.** Which one fires depends on the
  subscription's delivery schema. Implement both.
- **Failing open when the secret env var is unset.** An empty expected secret
  must reject, not accept.
- **Using `timingSafeEqual` without a length check.** It throws on length
  mismatch, which turns a bad credential into a 500.
- **Naming your custom header with the `aeg-` prefix.** Reserved for Event Grid
  system properties.
- **A malformed `Authorization` delivery-property value.** *"Non-conformant
  values in well-known headers cause the header to be dropped during event
  delivery to webhook destinations, but not during webhook validation."* The
  handshake passes, then every real delivery arrives without the header. Use a
  distinct custom header name to sidestep this entirely.
- **Building a source-IP allowlist.** There is no documented source-IP list for
  Event Grid webhook delivery. Azure service tags are for inbound-to-Azure
  traffic and are not an egress allowlist.
- **Slow handlers.** 30 seconds and the delivery is queued for retry — and the
  same 30-second budget applies to the handshake.
- **Assuming exactly-once, in-order delivery.** At-least-once and unordered.
  De-duplicate on the event `id`; `aeg-delivery-count > 1` means a retry.

## How to Debug Validation Failures

| Symptom | Likely cause |
|---------|--------------|
| Subscription create fails immediately | Endpoint not live, not HTTPS, or a self-signed certificate |
| Provisioning state `AwaitingManualAction` | You returned 200 without echoing the code — GET `validationUrl` within 10 minutes (port 553) |
| Provisioning state `Failed` | The 10-minute window elapsed, or the handshake errored — recreate the subscription |
| Handshake succeeds, deliveries 401 | Your delivery-property header was dropped for a non-conformant value, or the secret doesn't match |
| Everything 403 | `aeg-subscription-name` isn't in your allowlist — check the subscription's actual `--name` |
| OPTIONS requests you didn't expect | The subscription uses CloudEvents schema, so the abuse-protection preflight replaces the validation event |
| Repeated deliveries of the same event | Normal: at-least-once. De-duplicate on `id`, and check you ack within 30 seconds with a 200–204 |

## Source Documentation

- [Validate webhook endpoints with Event Grid schema](https://learn.microsoft.com/en-us/azure/event-grid/end-point-validation-event-grid-events-schema)
- [Endpoint validation using CloudEvents v1.0 schema](https://learn.microsoft.com/en-us/azure/event-grid/end-point-validation-cloud-events-schema)
- [Webhook event handlers](https://learn.microsoft.com/en-us/azure/event-grid/handler-webhooks)
- [Receive events to an HTTP endpoint](https://learn.microsoft.com/en-us/azure/event-grid/receive-events)
- [Custom delivery properties](https://learn.microsoft.com/en-us/azure/event-grid/delivery-properties)
- [Secure webhook delivery with Microsoft Entra ID](https://learn.microsoft.com/en-us/azure/event-grid/secure-webhook-delivery)
