# Setting Up a Google Cloud Pub/Sub Push Subscription

## Prerequisites

- A Google Cloud project with the Pub/Sub API enabled
- `roles/pubsub.editor` (or equivalent) on the project
- A **publicly reachable HTTPS** endpoint (Pub/Sub will not push to `http://`
  or to a private address). For local development, use the Hookdeck CLI tunnel
  described at the end of this file.

## Step 1: Create a Topic

Console: **Pub/Sub → Topics → Create topic**.

```bash
gcloud pubsub topics create my-topic
```

## Step 2: Create the Push Auth Service Account

This is the identity Pub/Sub impersonates when calling your endpoint. Its email
becomes the `email` claim in the OIDC token you verify.

```bash
gcloud iam service-accounts create pubsub-push \
  --display-name="Pub/Sub push identity"
```

The resulting email is
`pubsub-push@PROJECT_ID.iam.gserviceaccount.com`. This service account needs
**no roles of its own** — it only exists as an identity for the token.

## Step 3: Let the Pub/Sub Service Agent Mint Tokens

Grant the Pub/Sub service agent permission to create tokens for that service
account. Without this, subscription creation fails or tokens are never attached.

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')

gcloud iam service-accounts add-iam-policy-binding \
  pubsub-push@PROJECT_ID.iam.gserviceaccount.com \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

You also need `iam.serviceAccounts.actAs` on `pubsub-push@…` yourself
(`roles/iam.serviceAccountUser`) to reference it when creating the subscription.

## Step 4: Create the Push Subscription with OIDC Authentication

```bash
gcloud pubsub subscriptions create my-sub \
  --topic=my-topic \
  --push-endpoint=https://example.com/webhooks/google-pubsub \
  --push-auth-service-account=pubsub-push@PROJECT_ID.iam.gserviceaccount.com \
  --push-auth-token-audience=https://example.com/webhooks/google-pubsub \
  --ack-deadline=10
```

In the Console: **Subscriptions → Create subscription → Delivery type: Push**,
then tick **Enable authentication** and pick the service account.

### About the audience

`--push-auth-token-audience` sets the `aud` claim. **If you omit it, `aud`
defaults to the full push endpoint URL**, including scheme, host, path, and any
query string. Whichever you choose, your handler's `PUBSUB_AUDIENCE` must match
it byte for byte — a trailing slash difference is enough to fail verification.

Setting the audience explicitly to a stable string is usually easier to operate,
because you can then change the endpoint URL without re-configuring the receiver.

## Step 5: Configure Your Receiver

```bash
PUBSUB_AUDIENCE=https://example.com/webhooks/google-pubsub
PUBSUB_SERVICE_ACCOUNT_EMAIL=pubsub-push@PROJECT_ID.iam.gserviceaccount.com
PUBSUB_SUBSCRIPTION=projects/PROJECT_ID/subscriptions/my-sub
```

`PUBSUB_SUBSCRIPTION` is optional but cheap: it rejects envelopes whose
`subscription` field is not the one you expect.

There is **no signing secret to copy** anywhere in this process. If you are
looking for one, see [verification.md](verification.md) — Pub/Sub does not have
one.

## Step 6: Add a Dead Letter Topic (Recommended)

Without this, a message your handler can never process retries indefinitely.

```bash
gcloud pubsub topics create my-topic-dlq

gcloud pubsub subscriptions update my-sub \
  --dead-letter-topic=my-topic-dlq \
  --max-delivery-attempts=5
```

The Pub/Sub service agent needs `roles/pubsub.publisher` on the dead letter
topic and `roles/pubsub.subscriber` on the subscription for this to work.

## If You Cannot Use OIDC

Some platforms cannot forward or inspect the `Authorization` header. In that
case the fallback is an unguessable token in the push endpoint URL:

```bash
gcloud pubsub subscriptions create my-sub \
  --topic=my-topic \
  --push-endpoint="https://example.com/webhooks/google-pubsub?token=$(openssl rand -hex 32)"
```

Then set the same value as `PUBSUB_VERIFICATION_TOKEN` in your receiver. This is
a shared-secret convention, **not a Google-defined scheme** — it is only as
strong as your TLS and your logging hygiene (URLs with query strings end up in
access logs). Prefer OIDC where you can, and pair either approach with
network-level ingress restriction.

## Testing

### Publish a test message

```bash
# With a JSON payload and a routing attribute
gcloud pubsub topics publish my-topic \
  --message='{"orderId":"123","total":4995}' \
  --attribute=eventType=order.created

# Attribute-only message (no `data` field in the envelope)
gcloud pubsub topics publish my-topic --attribute=eventType=heartbeat
```

### Local development

Pub/Sub needs a public HTTPS URL. Start a tunnel (no account required):

```bash
npx hookdeck-cli listen 3000 google-pubsub --path /webhooks/google-pubsub
```

Use the printed HTTPS URL as `--push-endpoint`. If you did not set an explicit
audience, set `PUBSUB_AUDIENCE` to that exact URL.

### Pub/Sub emulator

```bash
gcloud beta emulators pubsub start
```

The emulator **never sends an `Authorization` header**, so OIDC verification
will always fail against it. Run the emulator with
`PUBSUB_ALLOW_UNAUTHENTICATED=true` (and no `PUBSUB_SERVICE_ACCOUNT_EMAIL`) on
your receiver, and never set that flag in production.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Subscription creation fails on the service account | Missing `roles/iam.serviceAccountTokenCreator` for the Pub/Sub service agent (Step 3) |
| Endpoint gets no traffic | Push endpoint is not public HTTPS, or the topic has no messages |
| Every request 401s | `PUBSUB_AUDIENCE` does not exactly match the subscription's audience (or push endpoint URL) |
| Messages keep redelivering | Handler returns non-2xx, or exceeds the ack deadline |
| No `Authorization` header at all | Subscription was created without `--push-auth-service-account`, or you are on the emulator |
