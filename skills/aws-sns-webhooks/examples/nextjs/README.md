# AWS SNS Webhooks - Next.js Example

Minimal example of receiving AWS SNS messages in a Next.js App Router route
handler, with signature verification, subscription confirmation, and
notification handling using the AWS-official
[`sns-validator`](https://www.npmjs.com/package/sns-validator).

## Prerequisites

- Node.js 18+
- An AWS account with an SNS topic (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. (Optional) Set `AWS_SNS_TOPIC_ARN` in `.env` to restrict which topic this
   endpoint trusts. There is no signing secret — SNS signatures are verified
   with AWS's public certificate.

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/aws-sns`. The route runs on the Node.js
runtime (`export const runtime = 'nodejs'`) because `sns-validator` fetches the
signing certificate and performs RSA verification.

## Receive webhooks locally

SNS must reach your endpoint over the public internet. Start a tunnel with the
Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 aws-sns --path /webhooks/aws-sns
```

Use the printed HTTPS URL as your SNS subscription endpoint. When you subscribe,
SNS immediately sends a `SubscriptionConfirmation`; this handler verifies it and
GETs the `SubscribeURL` to confirm, after which notifications start flowing.

## How it works

1. Reads the `x-amz-sns-message-type` header to branch on message type.
2. Verifies the RSA signature with `sns-validator` (fetches the cert from
   `SigningCertURL`, enforces an `sns.<region>.amazonaws.com` HTTPS host, and
   supports SignatureVersion 1 (SHA1) and 2 (SHA256)).
3. `SubscriptionConfirmation` → GETs `SubscribeURL` to confirm.
4. `Notification` → reads `Subject` / `Message` and processes it.
5. `UnsubscribeConfirmation` → logs it.
6. Responds `200` within ~15s so SNS does not treat delivery as failed.

## Test

```bash
npm test
```

The tests call the route handler directly with real SNS-style signatures
(bundled test key/cert) and mock the certificate fetch, covering valid
SigV1/SigV2 notifications, a missing `Subject`, tampered payloads, an untrusted
topic, subscription confirmation, and unsubscribe.
