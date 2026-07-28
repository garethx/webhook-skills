# Setting Up Quoter Webhooks

## Prerequisites

- A Quoter account with access to **Settings → Integrations**
- Your application's publicly reachable webhook endpoint URL (e.g. `https://yourapp.com/webhooks/quoter`)

## Configure the Webhook

1. In Quoter, go to **Settings → Integrations**.
2. Add / configure a webhook with the following:
   - **Target URL** — the endpoint that will receive the `POST` (e.g. `https://yourapp.com/webhooks/quoter`). The object type is not sent in the request, so append an object hint the handler can read, e.g. `https://yourapp.com/webhooks/quoter?object=quote`.
   - **Applies To** — the object type this webhook fires for: **Quote**, **Person**, or **Payment**. Each URL handles one object type; add a separate webhook (with a matching `?object=` value) per object type you want to receive.
   - **Format** — **JSON** or **XML** for the `data` field. These examples assume **JSON**.
   - **Hash Key** — a shared secret used to compute the verification hash. **This field is optional in Quoter, but you should always set it** (see the security note below).

## Get Your Hash Key

The **Hash Key** is whatever secret string you enter in the webhook configuration under **Settings → Integrations**. You choose it; Quoter then includes `md5(HASH_KEY + timestamp + data)` as the `hash` field on every delivery.

Store the same value in your application's environment:

```bash
QUOTER_HASH_KEY=your_hash_key_here
```

## ⚠️ Always Set a Hash Key

Quoter allows an **empty** hash key, which means webhooks are delivered with **no meaningful verification** — anyone who discovers your endpoint URL can forge requests. Because Quoter's scheme is already weak (MD5, no HTTP-header signature), leaving the hash key blank removes the last barrier.

**Recommendations:**

- Always configure a long, random Hash Key.
- Add a second layer of defense: an IP allowlist, a secret token in the URL path, or front the endpoint with [Hookdeck](https://hookdeck.com) for verification, retries, and observability.

## Payload Format: JSON vs XML

- **JSON** (recommended): the `data` field is a JSON string. Parse with `JSON.parse` / `json.loads` **after** verifying the hash.
- **XML**: the `data` field is an XML string. Parse with an XML library. The verification step is identical — hash the `data` string exactly as received.

## Test Mode vs Live Mode

Quoter does not document a separate webhook test mode. To exercise your endpoint end to end, create or update a matching object (Quote, Person, or Payment) in Quoter and watch your endpoint receive the delivery.

## Local Testing

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 quoter --path /webhooks/quoter
```

Point the Quoter webhook **Target URL** at the URL the CLI prints, then trigger a change in Quoter to see the request.
