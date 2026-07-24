// Generated with: shiphero-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a ShipHero webhook signature.
 *
 * ShipHero signs the RAW request body with HMAC-SHA256 keyed on the webhook's
 * shared_signature_secret, base64-encoded, sent in `x-shiphero-hmac-sha256`.
 *
 * @param {Buffer} rawBody - Raw request body (not parsed JSON)
 * @param {string} hmacHeader - x-shiphero-hmac-sha256 header value
 * @param {string} secret - shared_signature_secret from webhook_create
 * @returns {boolean} - Whether the signature is valid
 */
function verifyShipHeroWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
  } catch {
    // Length mismatch => invalid
    return false;
  }
}

// ShipHero webhook endpoint - must use the raw body for signature verification
app.post(
  '/webhooks/shiphero',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const hmac = req.headers['x-shiphero-hmac-sha256'];
    const messageId = req.headers['x-shiphero-message-id'];

    // Verify webhook signature against the raw body
    if (!verifyShipHeroWebhook(req.body, hmac, process.env.SHIPHERO_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification succeeds
    const payload = JSON.parse(req.body.toString('utf8'));

    // ShipHero has no topic header - the event type is in `webhook_type`
    const webhookType = payload.webhook_type;

    // Use X-Shiphero-Message-ID to deduplicate retried deliveries
    console.log(`Received "${webhookType}" webhook (message ${messageId})`);

    switch (webhookType) {
      case 'Order Allocated':
        console.log('Order allocated:', payload.order_number ?? payload.order_id);
        // TODO: Trigger downstream fulfillment, notify customer, etc.
        break;

      case 'Shipment Update':
        console.log('Shipment update for order:', payload.order_number ?? payload.order_id);
        // TODO: Send tracking email, update order status, etc.
        break;

      case 'Inventory Update':
        console.log('Inventory update for', payload.inventory?.length ?? 0, 'item(s)');
        // TODO: Sync stock levels to storefront/ERP, etc.
        break;

      case 'Order Canceled':
        console.log('Order canceled:', payload.order_number ?? payload.order_id);
        // TODO: Refund, restock, notify systems, etc.
        break;

      case 'PO Update':
        console.log('PO update:', payload.po_number ?? payload.po_id);
        // TODO: Track inbound inventory / receiving, etc.
        break;

      case 'Return Update':
        console.log('Return update:', payload.return_id ?? payload.rma);
        // TODO: Process refund, restock returned items, etc.
        break;

      case 'Tote Complete':
        console.log('Tote complete:', payload.tote_name ?? payload.tote_id);
        // TODO: Track picking progress, etc.
        break;

      case 'Package Added':
        console.log('Package added to order:', payload.order_number ?? payload.order_id);
        // TODO: Update packing / carton records, etc.
        break;

      default:
        console.log(`Unhandled webhook type: ${webhookType}`);
    }

    // ShipHero expects a 2xx with this exact acknowledgement body
    res.status(200).json({ code: '200', Status: 'Success' });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyShipHeroWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/shiphero`);
  });
}
