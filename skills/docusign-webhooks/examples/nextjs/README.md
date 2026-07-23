# DocuSign Webhooks - Next.js Example

Minimal example of receiving DocuSign Connect webhooks with HMAC signature verification using the Next.js App Router.

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
   cp .env.example .env.local
   ```

3. Add your DocuSign Connect HMAC secret to `.env.local` as `DOCUSIGN_HMAC_SECRET`

## Run

```bash
npm run dev
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

- The route reads the raw body with `await request.text()` before parsing — the HMAC is computed over the exact raw bytes.
- DocuSign signs with HMAC-SHA256 (base64) and sends the digest in `X-DocuSign-Signature-1` (one header per active key — only one must match).
