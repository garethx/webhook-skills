# Praxis Webhooks - Next.js Example

Minimal Next.js App Router example of receiving Praxis (Cashier) webhooks with
SHA-384 `gt-authentication` signature verification and a signed acknowledgement.

## Prerequisites

- Node.js 18+
- A Praxis merchant account and your **Merchant Secret**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Praxis **Merchant Secret** to `.env` as `PRAXIS_MERCHANT_SECRET`.

## Run

```bash
npm run dev
```

The handler lives at `app/webhooks/praxis/route.ts` and receives webhooks at
`POST http://localhost:3000/webhooks/praxis`.

## Test

```bash
npm test
```

The tests generate real SHA-384 signatures and assert the signed acknowledgement.

## Receive live webhooks locally

```bash
npx hookdeck-cli listen 3000 praxis --path /webhooks/praxis
```

Register the printed URL as your Praxis **Notification URL**.

## How verification works

The route reads the raw body with `await req.text()`, parses the JSON to rebuild
the signed field-value string, recomputes `sha384(values + merchant_secret)`, and
compares it timing-safely to the `gt-authentication` header. The `200` reply is a
`{ "status": 0, "timestamp": ... }` body signed with the
`external-request-signature` header. See
[../../references/verification.md](../../references/verification.md) for details.
