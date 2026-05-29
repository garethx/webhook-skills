# Standard Webhooks - Next.js Example

Minimal Next.js App Router example of receiving webhooks that follow the [Standard Webhooks](https://www.standardwebhooks.com/) specification, verified with the official `standardwebhooks` npm package.

## Prerequisites

- Node.js 18+
- A Standard Webhooks signing secret (`whsec_...`) from your provider

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your signing secret to `.env.local`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 with the webhook endpoint at `POST /webhooks/standard`.

## Test

```bash
npm test
```

Tests generate real Standard Webhooks signatures locally and exercise the route handler directly.

## Local Tunnel

To receive live webhooks on `localhost`:

```bash
npx hookdeck-cli listen 3000 standard --path /webhooks/standard
```
