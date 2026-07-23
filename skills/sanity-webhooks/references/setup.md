# Setting Up Sanity Webhooks

## Prerequisites

- A Sanity project with **Administrator** access
- Your application's webhook endpoint URL (publicly reachable, HTTPS)

## Create a Webhook

1. Go to [sanity.io/manage](https://www.sanity.io/manage) and select your project.
2. Open **API → Webhooks**.
3. Click **Create Webhook**.
4. Fill in:
   - **Name** — e.g. `Revalidate site`
   - **URL** — your endpoint, e.g. `https://example.com/webhooks/sanity`
   - **Dataset** — the dataset to watch (e.g. `production`)
   - **Trigger on** — `Create`, `Update`, and/or `Delete`
   - **Filter** (GROQ) — which documents fire the webhook, e.g.
     `_type == "post"` or `_type in ["post", "product"]`
   - **Projection** (GROQ, optional) — shape the request body. Leave empty to
     send the whole document after the change.
   - **HTTP method** — `POST`
   - **API version** — pin to a recent version (e.g. `v2021-06-07` or later)

## Get Your Signing Secret

1. In the webhook form, expand **Secret**.
2. Enter (or generate) a secret string. Sanity uses it to sign every delivery
   with the `sanity-webhook-signature` header.
3. Store the same value in your app as `SANITY_WEBHOOK_SECRET`.

The secret is only shown while editing the webhook — copy it into your
environment before saving. If you lose it, edit the webhook and set a new one.

## Choose Filter & Projection

**Filter** controls *which* changes trigger delivery:

```groq
_type == "post" && delta::changedAny(title, body, slug)
```

**Projection** controls *what* is sent. A small, explicit projection is faster
and avoids leaking fields:

```groq
{
  "_id": _id,
  "_type": _type,
  "slug": slug.current,
  "operation": select(
    before() == null => "create",
    after() == null => "delete",
    "update"
  )
}
```

Filters and projections **cannot** use sub-queries or cross-dataset references.

## Drafts and Versions

By default the webhook **ignores draft and version documents**. Only enable
drafts if you specifically need in-progress edits — Studio editing produces a
high volume of draft mutations.

## Delivery Behavior

- **At-least-once** delivery — build your handler to be idempotent.
- **1** concurrent request, **2** retries at **30s** intervals, **30s** timeout.
- Every retry carries the same `idempotency-key` header — use it to dedupe.

## Test Your Webhook

- In the webhook list at sanity.io/manage, use **Send test** / view the
  **Attempts** log to inspect deliveries, status codes, and payloads.
- For local development, tunnel with the Hookdeck CLI (no account required):

  ```bash
  npx hookdeck-cli listen 3000 sanity --path /webhooks/sanity
  ```

  Point the webhook URL at the tunnel, then edit a document in the Studio to
  trigger a real delivery.
