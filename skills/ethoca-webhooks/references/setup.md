# Setting Up Ethoca Webhooks

## Prerequisites

- An active Ethoca Alerts merchant account (via Mastercard / your acquirer or
  Ethoca partner).
- A publicly reachable **HTTPS** endpoint that can terminate **mutual TLS**.
- Contact with the **Ethoca Customer Delivery Team** — there is **no self-serve
  dashboard** to register a push endpoint.

## There Is No Self-Serve UI

Unlike most webhook providers, Ethoca push endpoints are configured **manually by
the Ethoca Customer Delivery Team** during onboarding. You cannot add or edit a
push URL yourself. Plan onboarding lead time accordingly.

During onboarding you agree with Ethoca:

1. **Endpoint URL** — where alerts are POSTed (e.g. `https://api.example.com/webhooks/ethoca`).
2. **HTTP Basic Auth credentials (optional)** — if you opt in, a username and
   password Ethoca will send as `Authorization: Basic base64(username:password)`.
   This is an optional application-layer factor; an mTLS-only endpoint can skip
   it.
3. **mTLS certificates** — exchange/trust of client and server certificates
   (Ethoca's client cert chains to the **Entrust** CA). This is the primary,
   definitive trust mechanism.
4. **`alertType` values** — confirm the literal `alertType` codes your account
   receives (these are not published publicly and may be numeric).

## Configure Transport Security (mTLS / MSSL)

Ethoca delivers over **mutual TLS (MSSL)**:

- Your server must **trust the Entrust CA** so Ethoca's client certificate
  validates.
- Configure your TLS terminator / load balancer to **request and require a client
  certificate**. This is where authenticity is enforced — the optional
  application-layer Basic Auth check is only a second factor when configured.
- Optionally restrict inbound traffic to Ethoca's published egress **IP ranges**
  (ask the Customer Delivery Team for the current list).

mTLS is handled by your infrastructure (nginx, Envoy, a cloud load balancer,
etc.), not by the example application code in this skill.

## Store the Basic Auth Credentials (if agreed)

If you agreed Basic Auth at onboarding, put the credentials in your environment:

```bash
ETHOCA_WEBHOOK_USERNAME=your_basic_auth_username
ETHOCA_WEBHOOK_PASSWORD=your_basic_auth_password
```

Your handler decodes the `Authorization: Basic ...` header and compares it to
these values with a timing-safe comparison — see [verification.md](verification.md).
If you did **not** agree Basic Auth (mTLS-only), leave these unset; the handler
then skips the Basic Auth check and relies on mTLS instead of returning `401`.

## Reporting Outcomes (Outbound Outcome API)

Receiving an alert is only half the flow. To tell Ethoca what you did (refunded,
already cancelled, could not find the transaction, etc.) you call the **Outcome
API**. That outbound call uses **OAuth 1.0a** signed with a **PKCS#12 (`.p12`)
keystore** issued to you by Mastercard — a completely different mechanism from the
inbound Basic Auth. See [verification.md](verification.md) for details and the
`mastercard-oauth1-signer` helper.

## Testing

- There is no public sandbox "send test alert" button; ask the Customer Delivery
  Team for test alerts against a staging endpoint.
- For local development, tunnel to your machine with the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 ethoca --path /webhooks/ethoca
  ```

  Note that a tunnel terminates TLS at the tunnel provider, so you cannot exercise
  the real mTLS path locally — use it to iterate on Basic Auth handling and event
  dispatch, and validate mTLS in a staging environment that mirrors production.

## Full Documentation

- [Ethoca Alerts Push API reference](https://developer.mastercard.com/ethoca-alerts-for-merchants/documentation/api-reference/push-api-ref/)
- [Ethoca Alerts API basics](https://developer.mastercard.com/ethoca-alerts-for-merchants/documentation/api-basics/)
