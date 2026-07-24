// Generated with: akeneo-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// 5-minute replay window (seconds)
const TIMESTAMP_TOLERANCE = 300;

/**
 * Verify an Akeneo webhook signature.
 *
 * Akeneo signs `timestamp + "." + rawBody` with HMAC-SHA256 (hex) using the
 * connection secret, sending the result in `x-akeneo-request-signature`.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT parse first)
 * @param {string} signature - x-akeneo-request-signature header
 * @param {string} timestamp - x-akeneo-request-timestamp header (unix seconds)
 * @param {string} secret - Akeneo connection secret
 * @returns {boolean}
 */
function verifyAkeneoWebhook(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp) {
    return false;
  }

  // Replay protection: reject stale requests
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > TIMESTAMP_TOLERANCE) {
    return false;
  }

  // Recompute HMAC over `timestamp + "." + rawBody`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison (guards against length mismatch)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// Dispatch a single event by its `action`
function handleAkeneoEvent(event) {
  const resource = event.data?.resource;

  switch (event.action) {
    case 'product.created':
      console.log('Product created:', resource?.identifier);
      // TODO: Sync new SKU downstream, index for search, etc.
      break;

    case 'product.updated':
      console.log('Product updated:', resource?.identifier);
      // TODO: Re-sync attributes, invalidate caches, etc.
      break;

    case 'product.removed':
      console.log('Product removed:', resource?.identifier);
      // TODO: Remove from storefront/catalog, etc.
      break;

    case 'product_model.created':
      console.log('Product model created:', resource?.code);
      // TODO: Create parent/variant groupings, etc.
      break;

    case 'product_model.updated':
      console.log('Product model updated:', resource?.code);
      // TODO: Re-sync model-level attributes, etc.
      break;

    case 'product_model.removed':
      console.log('Product model removed:', resource?.code);
      // TODO: Clean up variant groupings, etc.
      break;

    default:
      console.log(`Unhandled event: ${event.action}`);
  }
}

// Akeneo webhook endpoint - must use raw body for signature verification
app.post('/webhooks/akeneo',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-akeneo-request-signature'];
    const timestamp = req.headers['x-akeneo-request-timestamp'];

    // Verify webhook signature against the RAW body
    if (!verifyAkeneoWebhook(req.body, signature, timestamp, process.env.AKENEO_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification
    const payload = JSON.parse(req.body.toString('utf8'));
    const events = Array.isArray(payload.events) ? payload.events : [];

    // Acknowledge quickly, then process. Akeneo does not retry and expects a
    // fast 2xx — do heavy work asynchronously (queue/worker) in production.
    res.status(200).json({ received: true });

    // Akeneo batches up to 10 events per request
    for (const event of events) {
      handleAkeneoEvent(event);
    }
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyAkeneoWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/akeneo`);
  });
}
