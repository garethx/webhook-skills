// Generated with: shopline-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a SHOPLINE webhook signature.
 *
 * SHOPLINE signs the raw request body with HMAC-SHA256 using the app secret and
 * sends the digest in the `X-Shopline-Hmac-Sha256` header. The docs show a
 * base64 digest (Shopify-style); a stray sample shows hex — so we accept either.
 *
 * @param {Buffer} rawBody - Raw request body (do NOT parse before verifying)
 * @param {string} hmacHeader - X-Shopline-Hmac-Sha256 header value
 * @param {string} secret - SHOPLINE app secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyShoplineWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader) return false;

  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest();

  // Accept base64 (documented) or hex (stray sample) — timing-safe either way.
  return [digest.toString('base64'), digest.toString('hex')].some((expected) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected));
    } catch {
      return false; // length mismatch → not a match
    }
  });
}

// SHOPLINE webhook endpoint - must use raw body for signature verification
app.post('/webhooks/shopline',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const hmac = req.headers['x-shopline-hmac-sha256'];
    const topic = req.headers['x-shopline-topic'];
    const shop = req.headers['x-shopline-shop-domain'];
    const webhookId = req.headers['x-shopline-webhook-id'];

    // Verify webhook signature against the raw body
    if (!verifyShoplineWebhook(req.body, hmac, process.env.SHOPLINE_APP_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    const payload = JSON.parse(req.body.toString('utf8'));

    // Use the stable delivery ID to process each event idempotently
    console.log(`Received ${topic} from ${shop} (delivery ${webhookId})`);

    // Handle the event based on topic
    switch (topic) {
      case 'orders/create':
        console.log('New order:', payload.id);
        // TODO: Process new order, sync to fulfillment, etc.
        break;

      case 'orders/update':
        console.log('Order updated:', payload.id);
        // TODO: Update order status, sync changes, etc.
        break;

      case 'orders/paid':
        console.log('Order paid:', payload.id);
        // TODO: Trigger fulfillment, record payment, etc.
        break;

      case 'orders/cancelled':
        console.log('Order cancelled:', payload.id);
        // TODO: Refund processing, inventory adjustment, etc.
        break;

      case 'products/create':
        console.log('New product:', payload.id);
        // TODO: Sync to external catalog, etc.
        break;

      case 'products/update':
        console.log('Product updated:', payload.id);
        // TODO: Update external listings, etc.
        break;

      case 'products/delete':
        console.log('Product deleted:', payload.id);
        // TODO: Remove from external catalog, etc.
        break;

      case 'collect/create':
        console.log('Product added to collection:', payload.id);
        // TODO: Re-sync merchandising / category feeds, etc.
        break;

      case 'collect/delete':
        console.log('Product removed from collection:', payload.id);
        // TODO: Re-sync merchandising / category feeds, etc.
        break;

      case 'customers/create':
        console.log('New customer:', payload.id);
        // TODO: Welcome email, CRM sync, etc.
        break;

      case 'app/uninstalled':
        console.log('App uninstalled from shop:', shop);
        // TODO: Cleanup shop data, etc.
        break;

      default:
        console.log(`Unhandled topic: ${topic}`);
    }

    // Return 200 within 5 seconds to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyShoplineWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/shopline`);
  });
}
