# AWS SNS Webhooks - FastAPI Example

Minimal example of receiving AWS SNS messages in FastAPI with **manual**
signature verification (there is no AWS webhook-verification SDK for Python), plus
subscription confirmation and notification handling.

## Prerequisites

- Python 3.9+
- An AWS account with an SNS topic (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
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
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/aws-sns`.

## Receive webhooks locally

SNS must reach your endpoint over the public internet. Start a tunnel with the
Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 aws-sns --path /webhooks/aws-sns
```

Use the printed HTTPS URL as your SNS subscription endpoint. When you subscribe,
SNS immediately sends a `SubscriptionConfirmation`; this handler verifies it and
GETs the `SubscribeURL` to confirm, after which notifications start flowing.

## How it works

1. Reads the `x-amz-sns-message-type` header to branch on message type.
2. Verifies the RSA signature manually with `cryptography`: it host-checks and
   fetches the cert from `SigningCertURL` (must be `sns.<region>.amazonaws.com`
   over HTTPS), rebuilds the canonical string, and verifies with SHA1
   (SignatureVersion 1) or SHA256 (SignatureVersion 2). The field selection
   mirrors the AWS-official `sns-validator` used in the Node examples.
3. `SubscriptionConfirmation` → GETs `SubscribeURL` to confirm.
4. `Notification` → reads `Subject` / `Message` and processes it.
5. `UnsubscribeConfirmation` → logs it.
6. Responds `200` within ~15s so SNS does not treat delivery as failed.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate real SNS-style signatures with a bundled test key/cert and
patch the certificate fetch, covering valid SigV1/SigV2 notifications, a missing
`Subject`, tampered payloads, an untrusted certificate host, an untrusted topic,
subscription confirmation, and unsubscribe.
