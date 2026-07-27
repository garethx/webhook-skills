# Upollo Webhooks - Express Example

Minimal example of receiving Upollo webhooks with `Upollo-Signature`
(HMAC-SHA512) verification, dispatching on the recommended `action` and the
raised `flags`.

## Prerequisites

- Node.js 18+
- An Upollo webhook URL + secret created on the Access & Keys page (see the
  skill's `references/setup.md`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Upollo webhook secret to `.env` as `UPOLLO_WEBHOOK_SECRET`. Upollo
   generates this when you add your webhook URL under Webhooks on the Access &
   Keys page.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit/integration tests:

```bash
npm test
```

### Using Hookdeck CLI

Forward webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 upollo --path /webhooks/upollo
```

Point your Upollo webhook URL at the Hookdeck URL the CLI prints, then trigger a
flag by reporting a user with a suffixed email (e.g.
`you+account_sharing@example.com`). Hookdeck forwards the delivery so you can
inspect and replay it.

## How It Works

- **Verify** — Upollo signs each delivery with `Upollo-Signature`
  (`t:<ts>,s0:<hmac-sha512>`). The handler recomputes `HMAC-SHA512` over the raw
  body and constant-time compares it to `s0` before processing.
- **Dispatch** — After verifying, the handler iterates `flags[]` (e.g.
  `ACCOUNT_SHARING`, `MULTIPLE_ACCOUNTS`) and acts on the recommended `action`
  (`CHALLENGE`, `DENY`, `PERMIT`, `OFFER`, `LOG`).

## Endpoint

- `POST /webhooks/upollo` - Verifies and processes the analysis
