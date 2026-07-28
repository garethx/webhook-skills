# Praxis Webhooks - Express Example

Minimal example of receiving Praxis (Cashier) webhooks with SHA-384
`gt-authentication` signature verification and a signed acknowledgement.

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
npm start
```

Server runs on http://localhost:3000 and receives webhooks at
`POST /webhooks/praxis`.

## Test

Run the test suite (generates real SHA-384 signatures and checks the signed ack):

```bash
npm test
```

## Receive live webhooks locally

Use the Hookdeck CLI to tunnel Praxis deliveries to your local server — no
account required:

```bash
npx hookdeck-cli listen 3000 praxis --path /webhooks/praxis
```

Register the printed URL as your Praxis **Notification URL**.

## How verification works

- Praxis signs a fixed list of field **values** (in the documented order, not
  alphabetized), appends your Merchant Secret, and SHA-384s the result. The
  digest arrives in the lowercase `gt-authentication` header.
- The handler parses the JSON, rebuilds the signed string, recomputes the digest,
  and compares it timing-safely.
- The `200` acknowledgement returns `{ "status": 0, "timestamp": ... }` and is
  signed with the `external-request-signature` header
  (`sha384(status + timestamp + secret)`).

See [../../references/verification.md](../../references/verification.md) for the
full algorithm and gotchas.
