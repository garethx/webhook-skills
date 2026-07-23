// Generated with: sanity-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const { isValidSignature, SIGNATURE_HEADER_NAME } = require('@sanity/webhook');

const app = express();

const webhookSecret = process.env.SANITY_WEBHOOK_SECRET;

// Sanity webhook endpoint.
// Use express.text() so we get the RAW body string for signature verification.
// Do NOT use express.json() here — parsing + re-stringifying breaks the HMAC.
app.post(
  '/webhooks/sanity',
  express.text({ type: 'application/json' }),
  async (req, res) => {
    const rawBody = req.body; // string
    const signature = req.headers[SIGNATURE_HEADER_NAME]; // 'sanity-webhook-signature'

    if (!signature) {
      return res.status(400).send('Missing sanity-webhook-signature header');
    }

    // Verify the signature against the raw body using the official SDK.
    // isValidSignature is async in @sanity/webhook v4+ and returns a boolean.
    let valid;
    try {
      valid = await isValidSignature(rawBody, signature, webhookSecret);
    } catch (err) {
      // Malformed signature header, etc.
      console.error('Signature verification error:', err.message);
      return res.status(400).send('Invalid signature');
    }

    if (!valid) {
      return res.status(400).send('Invalid signature');
    }

    // Safe to parse now that the payload is verified.
    let doc;
    try {
      doc = JSON.parse(rawBody);
    } catch {
      return res.status(400).send('Invalid JSON payload');
    }

    // Optional: deduplicate retries using the idempotency-key header.
    const idempotencyKey = req.headers['idempotency-key'];

    // Sanity has no fixed event names — dispatch on the document `_type`
    // (from the default payload or your GROQ projection).
    switch (doc._type) {
      case 'post':
        console.log('Post changed:', doc._id, `(idempotency-key: ${idempotencyKey})`);
        // TODO: Revalidate /blog/[slug], purge CDN cache, etc.
        break;

      case 'author':
        console.log('Author changed:', doc._id);
        // TODO: Revalidate author pages.
        break;

      case 'product':
        console.log('Product changed:', doc._id);
        // TODO: Revalidate storefront, reindex search, etc.
        break;

      case 'category':
        console.log('Category changed:', doc._id);
        // TODO: Rebuild navigation, revalidate listings.
        break;

      case 'page':
        console.log('Page changed:', doc._id);
        // TODO: Revalidate the page route.
        break;

      default:
        console.log(`Unhandled document type: ${doc._type}`);
    }

    // Return 200 to acknowledge receipt.
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sanity`);
  });
}
