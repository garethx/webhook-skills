# Setting Up Utila Webhooks

## Prerequisites

- A Utila account with access to the **Console** and permission to edit
  **Vault Settings**.
- Your application's public HTTPS webhook endpoint URL (Utila requires HTTPS).

## Register Your Endpoint

1. In the Utila **Console**, open the vault you want events for.
2. Go to **Vault Settings → Webhooks**.
3. Add a new webhook and enter your endpoint URL
   (e.g. `https://your-app.com/webhooks/utila`).
4. Save. Utila will begin delivering the five event types
   (`TRANSACTION_CREATED`, `TRANSACTION_STATE_UPDATED`, `WALLET_CREATED`,
   `WALLET_ADDRESS_CREATED`, `TRANSACTION_AML_SCREENING_RESULT_READY`) to it.

## Get the Public Key

Utila signs deliveries with an RSA-4096 **private** key and publishes the matching
**public** key in the Console. There is **no shared secret** — you never hold a
signing key.

1. In **Vault Settings → Webhooks**, copy the **PEM-encoded RSA-4096 public key**.
2. Provide it to your app as the `UTILA_WEBHOOK_PUBLIC_KEY` environment variable.

The PEM looks like:

```
-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8A...
-----END PUBLIC KEY-----
```

Because the value is multi-line, store it either as a genuine multi-line env value
or as a single line with escaped `\n` newlines. The examples normalize `\n` back to
real newlines before loading the key.

## Authentication

Utila webhooks are authenticated **solely by the RSA signature** in the
`x-utila-signature` header — there is no API key, Basic Auth, or IP allowlist on
the inbound delivery. Your responsibility is to verify the signature with the
public key and return HTTP 200. See [verification.md](verification.md).

To *fetch full resource detail* referenced by an event (via the Utila API /
Stream), you authenticate separately with your Utila API credentials — that is a
different flow from verifying the inbound webhook.

## Testing

- Trigger real events in the Console (e.g. create a wallet address) and watch your
  endpoint receive `WALLET_ADDRESS_CREATED`.
- For local development, tunnel deliveries to your machine with the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 utila --path /webhooks/utila
  ```

  Point the Console webhook URL at the tunnel URL the CLI prints.
