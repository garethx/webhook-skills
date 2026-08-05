# Setting Up the Vapi Server URL

## Prerequisites

- A [Vapi account](https://dashboard.vapi.ai) with an assistant, phone number, or
  tool to receive events for.
- A publicly reachable **HTTPS** endpoint that accepts `POST`.

## Configure the Server URL

You can set a Server URL at four levels — the **most specific wins**, and only
one receives a given event:

**Custom Tool > Assistant > Phone Number > Account-wide (Organization).**

- **Account-wide:** Dashboard → **Settings → Organization → General Settings**
  (or **Settings → Integrations → Server Configuration**).
- **Per assistant / phone number / tool:** the `server` object on that resource:

  ```json
  {
    "server": {
      "url": "https://api.example.com/webhooks/vapi",
      "credentialId": "cred_..."
    }
  }
  ```

## Authenticate the Endpoint (attach a credential)

**By default a Server URL has no authentication.** Anyone who learns the URL
could POST to it, so attach a credential. Credentials are created in the
dashboard as **Custom Credentials** and referenced by `credentialId` on the
`server` object. Four types exist — see
[verification.md](verification.md) for how to verify each:

1. **Bearer Token** (recommended) — Vapi sends `Authorization: Bearer <token>`.
2. **Legacy `X-Vapi-Secret`** — a Bearer-Token credential with the header name set
   to `X-Vapi-Secret` and the prefix disabled. Reproduces the older inline
   `server.secret` field:

   ```json
   { "server": { "url": "https://api.example.com/webhooks/vapi", "secret": "your-shared-secret" } }
   ```

3. **OAuth 2.0 (client credentials)** — Vapi fetches a token from your token URL
   and presents it as `Authorization: Bearer <token>`.
4. **HMAC** — you choose the algorithm, header name, optional timestamp header,
   and payload format.

## Store the Shared Secret

For the recommended shared-secret path, store the token your credential sends:

```bash
VAPI_WEBHOOK_SECRET=your_shared_secret
```

Your handler reads the token from `Authorization` (stripping `Bearer `) or
`X-Vapi-Secret` and compares it to `VAPI_WEBHOOK_SECRET` with a timing-safe
comparison — see [verification.md](verification.md).

## Respond Correctly

- **Informational messages:** return **`200`** promptly (no body needed).
- **Request/response messages** (`assistant-request`, `tool-calls`,
  `transfer-destination-request`, `knowledge-base-request`): return **`200` with
  the required JSON body**. `assistant-request` must answer within a hard
  **~7.5-second** timeout.
- **Failed auth:** return **`401`**.

## Testing

- Place a real test call (or trigger a chat/session) in your Vapi account and
  watch the messages arrive.
- **Local development.** `vapi listen` is a *local forwarder only* — it does not
  create a public tunnel. Pair it with a tunnel, or just use the Hookdeck CLI
  (which gives you a public URL and an inspector):

  ```bash
  # Option A: Vapi CLI forwarder (default listen port 4242) + your own tunnel
  vapi listen --forward-to localhost:3000/webhooks/vapi

  # Option B: Hookdeck CLI — public HTTPS URL + replay UI, no account needed
  npx hookdeck-cli listen 3000 vapi --path /webhooks/vapi
  ```

  Register the resulting public HTTPS URL as your Server URL in the dashboard.

> The Vapi CLI forwarder adds debug headers (`X-Forwarded-For`,
> `X-Original-Host`, `X-Webhook-Event`, `X-Webhook-Timestamp`) when forwarding.
> These are **CLI debug headers, not part of Vapi's production wire format** —
> don't rely on them in your handler.

## Full Documentation

- [Server URL](https://docs.vapi.ai/server-url)
- [Server Authentication](https://docs.vapi.ai/server-url/server-authentication)
- [Server Events](https://docs.vapi.ai/server-url/events)
