// Generated with: tebex-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const webhookSecret = process.env.TEBEX_WEBHOOK_SECRET;

/**
 * Verify a Tebex webhook signature.
 *
 * Tebex signs the hex `X-Signature` header in TWO steps:
 *   1. SHA-256 hash the raw body (hex)
 *   2. HMAC-SHA256 that hash, keyed with the webhook secret (hex)
 * i.e. hash_hmac('sha256', hash('sha256', body), secret)
 *
 * Always verify against the RAW body — a parsed/re-serialized body will not match.
 */
function verifyTebexSignature(rawBody, signatureHeader, secret) {
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const expected = crypto.createHmac('sha256', secret).update(bodyHash).digest('hex');

  const received = Buffer.from(signatureHeader || '');
  const expectedBuf = Buffer.from(expected);
  return received.length === expectedBuf.length &&
    crypto.timingSafeEqual(received, expectedBuf);
}

// Tebex webhook endpoint - must use raw body for signature verification
app.post('/webhooks/tebex',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-signature'];

    if (!signature) {
      return res.status(400).send('Missing X-Signature header');
    }

    // req.body is a Buffer (the raw bytes Tebex signed)
    if (!verifyTebexSignature(req.body, signature, webhookSecret)) {
      console.error('Tebex webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Signature is valid — safe to parse
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Setup handshake: echo the id back with a 200 to activate the endpoint
    if (event.type === 'validation.webhook') {
      console.log('Tebex validation.webhook received:', event.id);
      return res.status(200).json({ id: event.id });
    }

    // Handle the event based on type
    switch (event.type) {
      case 'payment.completed':
        console.log('Payment completed:', event.subject);
        // TODO: Grant perks, deliver goods, fulfill the order
        break;

      case 'payment.declined':
        console.log('Payment declined:', event.subject);
        // TODO: Notify the buyer, log the failure
        break;

      case 'payment.refunded':
        console.log('Payment refunded:', event.subject);
        // TODO: Revoke perks, update accounting
        break;

      case 'payment.dispute.opened':
      case 'payment.dispute.won':
      case 'payment.dispute.lost':
      case 'payment.dispute.closed':
        console.log(`Dispute event ${event.type}:`, event.subject);
        // TODO: Flag the account, gather evidence, update case state
        break;

      case 'recurring-payment.started':
        console.log('Subscription started:', event.subject);
        // TODO: Provision recurring access
        break;

      case 'recurring-payment.renewed':
        console.log('Subscription renewed:', event.subject);
        // TODO: Extend access, record the renewal
        break;

      case 'recurring-payment.ended':
        console.log('Subscription ended:', event.subject);
        // TODO: Revoke recurring access
        break;

      case 'recurring-payment.cancellation.requested':
        console.log('Cancellation requested:', event.subject);
        // TODO: Schedule end-of-term revocation
        break;

      case 'recurring-payment.cancellation.aborted':
        console.log('Cancellation aborted:', event.subject);
        // TODO: Keep the subscription active
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return 2XX to acknowledge receipt (non-2XX triggers Tebex retries)
    res.status(200).json({ received: true });
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tebex`);
  });
}
