// Generated with: picqer-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Picqer webhook signature.
 *
 * Picqer signs the raw request body with HMAC-SHA256 keyed on the per-hook
 * secret, base64-encodes it, and sends it in the X-Picqer-Signature header.
 *
 * @param {Buffer} rawBody - Raw request body (not parsed JSON)
 * @param {string} signatureHeader - X-Picqer-Signature header value
 * @param {string} secret - The secret set when creating the hook
 * @returns {boolean} - Whether the signature is valid
 */
function verifyPicqerWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    // Different lengths = invalid signature
    return false;
  }
}

// Picqer webhook endpoint - must use raw body for signature verification
app.post('/webhooks/picqer',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-picqer-signature'];

    // Verify webhook signature against the raw body
    if (!verifyPicqerWebhook(req.body, signature, process.env.PICQER_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString());
    const { event, event_triggered_at: eventTriggeredAt, data } = payload;

    console.log(`Received ${event} (triggered at ${eventTriggeredAt})`);

    // Picqer sends no dedicated idempotency key. To deduplicate retried
    // deliveries, derive one from the resource ID in `data` plus the event and
    // its trigger time, e.g. `${event}:${data.idorder}:${eventTriggeredAt}`.
    // TODO: deduplicate on that derived key

    // Dispatch on the event field in the payload (Picqer has no event header)
    switch (event) {
      case 'orders.created':
        console.log('New order:', data && data.idorder);
        // TODO: sync order to ERP, trigger downstream flows, etc.
        break;

      case 'orders.completed':
        console.log('Order completed:', data && data.idorder);
        // TODO: notify customer, close order in other systems, etc.
        break;

      case 'orders.status_changed':
        console.log('Order status changed:', data && data.idorder);
        // TODO: keep external order state in sync
        break;

      case 'picklists.created':
        console.log('Picklist created:', data && data.idpicklist);
        // TODO: kick off picking workflows
        break;

      case 'picklists.closed':
        console.log('Picklist closed:', data && data.idpicklist);
        // TODO: trigger packing / shipping
        break;

      case 'picklists.shipments.created':
        console.log('Shipment created for picklist:', data && data.idpicklist);
        // TODO: send tracking info to the customer
        break;

      case 'products.created':
        console.log('Product created:', data && data.idproduct);
        // TODO: sync catalog to storefront
        break;

      case 'products.stock_changed':
        console.log('Product stock changed:', data && data.idproduct);
        // TODO: update stock on your storefront
        break;

      case 'purchase_orders.created':
        console.log('Purchase order created:', data && data.idpurchaseorder);
        // TODO: notify suppliers, sync procurement
        break;

      case 'returns.created':
        console.log('Return created:', data && data.idreturn);
        // TODO: start return handling / refunds
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Acknowledge quickly (Picqer expects 200/201/202 within 10 seconds)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyPicqerWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/picqer`);
  });
}
