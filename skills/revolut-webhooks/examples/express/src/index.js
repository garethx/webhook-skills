// Generated with: revolut-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNING_SECRET = process.env.REVOLUT_SIGNING_SECRET;
const TOLERANCE_MS = 5 * 60 * 1000; // Revolut recommends a 5-minute tolerance

/**
 * Verify a Revolut webhook signature.
 *
 * Revolut signs `v1.{timestamp}.{raw body}` with HMAC-SHA256 (hex) using the
 * webhook signing secret (wsk_...). The Revolut-Signature header holds one or
 * more `v1=<hex>` values (comma-separated during secret rotation).
 */
function verifyRevolutSignature(rawBody, timestamp, signatureHeader, secret) {
  if (!timestamp || !signatureHeader || !secret) return false;

  // Reject stale timestamps. Header is a UNIX timestamp in milliseconds.
  const ts = Number(timestamp);
  const tsMs = timestamp.length <= 10 ? ts * 1000 : ts; // tolerate seconds or ms
  if (!Number.isFinite(ts) || Math.abs(Date.now() - tsMs) > TOLERANCE_MS) {
    return false;
  }

  const expected =
    'v1=' +
    crypto.createHmac('sha256', secret).update(`v1.${timestamp}.${rawBody}`).digest('hex');

  // Header may hold multiple signatures during rotation — accept any match.
  return signatureHeader.split(',').some((sig) => {
    const a = Buffer.from(sig.trim());
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

// Revolut webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/revolut', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['revolut-signature'];
  const timestamp = req.headers['revolut-request-timestamp'];

  if (!signature || !timestamp) {
    return res.status(400).send('Missing Revolut signature headers');
  }

  // req.body is a Buffer because of express.raw()
  const rawBody = req.body.toString('utf8');

  if (!verifyRevolutSignature(rawBody, timestamp, signature, SIGNING_SECRET)) {
    console.error('Webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Handle the event based on type
  switch (event.event) {
    case 'ORDER_COMPLETED':
      console.log('Order completed:', event.order_id);
      // TODO: Fulfil the order, send a receipt, etc.
      break;

    case 'ORDER_AUTHORISED':
      console.log('Order authorised:', event.order_id);
      // TODO: Reserve stock / prepare capture, etc.
      break;

    case 'ORDER_CANCELLED':
      console.log('Order cancelled:', event.order_id);
      // TODO: Release reserved stock, update order status, etc.
      break;

    case 'ORDER_PAYMENT_AUTHENTICATED':
      console.log('Payment authenticated:', event.order_id);
      // TODO: Track authentication progress, etc.
      break;

    case 'ORDER_PAYMENT_DECLINED':
      console.log('Payment declined:', event.order_id);
      // TODO: Notify the customer, offer another payment method, etc.
      break;

    case 'ORDER_PAYMENT_FAILED':
      console.log('Payment failed:', event.order_id);
      // TODO: Retry, alert the customer, etc.
      break;

    default:
      console.log(`Unhandled event type: ${event.event}`);
  }

  // Return 200 to acknowledge receipt
  res.json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helper for testing
module.exports = app;
module.exports.verifyRevolutSignature = verifyRevolutSignature;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/revolut`);
  });
}
