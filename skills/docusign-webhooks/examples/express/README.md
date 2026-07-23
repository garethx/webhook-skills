# DocuSign Webhooks - Express Example

Minimal example of receiving DocuSign Connect webhooks with HMAC signature verification.

## Prerequisites

- Node.js 18+
- A DocuSign account with a Connect HMAC secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your DocuSign Connect HMAC secret to `.env` as `DOCUSIGN_HMAC_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real HMAC signatures):

```bash
npm test
```

### Receive real webhooks locally with Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 docusign --path /webhooks/docusign
```

Use the printed URL as the **URL to publish to** on your DocuSign Connect configuration.

## Endpoint

- `POST /webhooks/docusign` - Receives and verifies DocuSign Connect webhook events

## Notes

- The `docusign-esign` SDK manages Connect configurations and `eventNotification` objects but provides **no** signature-verification helper, so this example verifies the HMAC manually.
- DocuSign signs the raw body with HMAC-SHA256 (base64) and sends it in `X-DocuSign-Signature-1` (one header per active key — only one must match).
