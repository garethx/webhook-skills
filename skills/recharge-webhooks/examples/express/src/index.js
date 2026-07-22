// Generated with: recharge-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Recharge webhook signature.
 *
 * GOTCHA: despite the `X-Recharge-Hmac-Sha256` header name, this is NOT HMAC.
 * It is a plain SHA-256 of (clientSecret + rawBody), with the secret prepended,
 * hex-encoded.
 *
 * @param {Buffer} rawBody - Raw request body (Buffer, not parsed JSON)
 * @param {string} signatureHeader - X-Recharge-Hmac-Sha256 header value
 * @param {string} clientSecret - Recharge API Client Secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyRechargeWebhook(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader) return false;

  const digest = crypto
    .createHash('sha256')
    .update(clientSecret) // secret first
    .update(rawBody) // then the raw body bytes
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

// Recharge webhook endpoint - must use the raw body for signature verification
app.post(
  '/webhooks/recharge',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-recharge-hmac-sha256'];
    const topic = req.headers['x-recharge-topic'];

    // 1. Verify first
    if (
      !verifyRechargeWebhook(
        req.body,
        signature,
        process.env.RECHARGE_API_CLIENT_SECRET
      )
    ) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // 2. Parse only after verification. Recharge wraps the resource by key,
    //    e.g. { "charge": {...} }, { "subscription": {...} }, { "order": {...} }.
    const payload = JSON.parse(req.body.toString('utf8'));

    console.log(`Received ${topic} webhook`);

    // 3. Dispatch on the topic. Return 200 fast; do slow work asynchronously.
    switch (topic) {
      case 'charge/created':
        console.log('Charge created:', payload.charge?.id);
        // TODO: pre-billing checks, previews, etc.
        break;

      case 'charge/paid':
        console.log('Charge paid:', payload.charge?.id);
        // TODO: grant access, record revenue, trigger fulfillment, etc.
        break;

      case 'charge/failed':
        console.log('Charge failed:', payload.charge?.id);
        // TODO: dunning, notify customer, etc.
        break;

      case 'subscription/created':
        console.log('Subscription created:', payload.subscription?.id);
        // TODO: onboarding, provisioning, etc.
        break;

      case 'subscription/cancelled':
        console.log('Subscription cancelled:', payload.subscription?.id);
        // TODO: revoke access, win-back flow, etc.
        break;

      case 'order/created':
        console.log('Order created:', payload.order?.id);
        // TODO: sync to OMS/ERP, etc.
        break;

      case 'order/processed':
        console.log('Order processed:', payload.order?.id);
        // TODO: trigger fulfillment, etc.
        break;

      case 'customer/updated':
        console.log('Customer updated:', payload.customer?.id);
        // TODO: CRM sync, payment method updates, etc.
        break;

      default:
        console.log(`Unhandled topic: ${topic}`);
    }

    // Acknowledge receipt within 5 seconds
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyRechargeWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/recharge`);
  });
}
