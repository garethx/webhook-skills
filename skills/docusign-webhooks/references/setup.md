# Setting Up DocuSign Webhooks (Connect)

## Prerequisites

- A DocuSign account with **admin** access (to reach eSignature Admin → Connect), or API access to create per-envelope `eventNotification`s
- Your application's webhook endpoint URL (must be HTTPS and publicly reachable)

## Create the HMAC Secret

The HMAC secret is what DocuSign uses to sign each webhook. Generate it in the Connect settings, **not** at the individual configuration level:

1. Go to **eSignature Admin** (Settings).
2. Open **Connect** → **Connect Keys** (sometimes shown as **HMAC**).
3. Click **Add Secret Key** / **Generate a new key**.
4. Copy the generated key value — this is your `DOCUSIGN_HMAC_SECRET`. Store it securely; you cannot retrieve it again later.

You can have **up to 100 active keys** at once. When more than one is active, DocuSign signs each request once per key and sends a separate `X-DocuSign-Signature-N` header for each — this is how you rotate keys with zero downtime.

## Create an Account-Level Connect Configuration

1. In **eSignature Admin**, go to **Settings → Connect**.
2. Click **Add Configuration → Custom**.
3. Set:
   - **Name** — any label.
   - **URL to publish to** — your endpoint, e.g. `https://your-app.com/webhooks/docusign`.
   - **Enable Log** — turn on to inspect deliveries and failures.
4. Under **Event Message Delivery Mode**, choose **Send Individual Messages (SIM)**.
5. Under **Data Format**, choose **JSON** (legacy XML SIM was retired May 2023).
6. Set the **eventData** / **Include Data** version to **`restv2.1`**.
7. Select the **events to subscribe to** (e.g. `envelope-completed`, `recipient-completed`).
8. Under **Include Data**, optionally enable `Recipients`, `Documents`, `Tabs`, etc. — recipient/document detail is **only** delivered when these are on.
9. Save.

## Per-Envelope Configuration (API)

To attach a webhook to a single envelope, include an `eventNotification` when creating it:

```json
{
  "emailSubject": "Please sign",
  "status": "sent",
  "eventNotification": {
    "url": "https://your-app.com/webhooks/docusign",
    "requireAcknowledgment": "true",
    "loggingEnabled": "true",
    "deliveryMode": "SIM",
    "eventData": { "version": "restv2.1" },
    "events": ["envelope-completed", "recipient-completed"],
    "includeData": ["recipients"]
  }
}
```

The `docusign-esign` SDK (Node `docusign-esign` / Python `docusign-esign`) can build this `eventNotification` object and manage account-level Connect configs, but the SDK provides **no** signature-verification helper — you verify the HMAC yourself (see [verification.md](verification.md)).

## Additional Security Options

Beyond HMAC, Connect supports:

- **HTTP Basic authentication** on the listener URL (username/password embedded in config).
- **Mutual TLS** (client certificate).
- **X.509 message signing** (SOAP-style signed payloads).

HMAC is the simplest to verify in application code and is what the examples in this skill use.

## Test Your Endpoint

1. From the Connect configuration list, use **Actions → Send Test** (or trigger a real envelope).
2. Check the **Connect logs** for the delivery and response code.
3. For local development, tunnel the request:

```bash
npx hookdeck-cli listen 3000 docusign --path /webhooks/docusign
```

Use the printed URL as the **URL to publish to** on the Connect configuration.

## Environment Variables

```bash
# .env
DOCUSIGN_HMAC_SECRET=your_connect_hmac_secret_here
```

## Full Documentation

- [DocuSign Connect overview](https://developers.docusign.com/platform/webhooks/connect/)
- [Event triggers](https://developers.docusign.com/platform/webhooks/connect/event-triggers/)
- [Validate an HMAC signature](https://developers.docusign.com/platform/webhooks/connect/validate/)
