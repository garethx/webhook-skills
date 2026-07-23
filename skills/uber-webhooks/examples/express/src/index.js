// Generated with: uber-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Uber Eats webhook signature.
 *
 * Uber signs the raw request body with HMAC-SHA256 keyed on your app's
 * client secret and sends the digest as a lowercased hex string in the
 * X-Uber-Signature header (no "sha256=" prefix).
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Uber-Signature header value (hex)
 * @param {string} clientSecret - Uber app client secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyUberWebhook(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader) {
    return false;
  }

  // Compute expected signature: lowercase hex HMAC-SHA256 of the raw body
  const expectedSignature = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false; // Malformed hex or length mismatch
  }
}

// Uber webhook endpoint - must use raw body for signature verification
app.post('/webhooks/uber',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-uber-signature'];

    // Verify webhook signature against the raw body
    if (!verifyUberWebhook(req.body, signature, process.env.UBER_CLIENT_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification. The event type is in the body.
    const payload = JSON.parse(req.body.toString());
    const eventType = payload.event_type;
    const resourceHref = payload.resource_href || payload.meta?.resource_href;

    console.log(`Received ${eventType} event (id: ${payload.event_id})`);

    // Handle the event based on its event_type
    switch (eventType) {
      case 'orders.notification':
        console.log('New order created:', resourceHref);
        // TODO: Fetch the full order from resource_href, ingest into POS
        break;

      case 'orders.cancel':
        console.log('Order cancelled:', resourceHref);
        // TODO: Void the order, stop preparation
        break;

      case 'orders.failure':
        console.log('Order failed/cancelled (v1.0.0):', resourceHref);
        // TODO: Void the order, alert staff
        break;

      case 'orders.release':
        console.log('Order released (courier at geo-fence):', resourceHref);
        // TODO: Start final preparation / hand-off
        break;

      case 'orders.scheduled.notification':
        console.log('Scheduled order created:', resourceHref);
        // TODO: Queue the order for its scheduled time
        break;

      case 'order.fulfillment_issues.resolved':
        console.log('Fulfillment issue resolved:', resourceHref);
        // TODO: Update the order, resume preparation
        break;

      case 'store.provisioned':
        console.log('Store provisioned:', payload.meta?.resource_id);
        // TODO: Begin syncing menu/availability
        break;

      case 'store.deprovisioned':
        console.log('Store deprovisioned:', payload.meta?.resource_id);
        // TODO: Stop syncing, clean up
        break;

      case 'store.status.changed':
        console.log('Store status changed:', payload.meta?.status);
        // TODO: Reflect open/closed state in your system
        break;

      default:
        console.log(`Unhandled event: ${eventType}`);
    }

    // Acknowledge with HTTP 200 and an empty body
    res.status(200).end();
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyUberWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/uber`);
  });
}
