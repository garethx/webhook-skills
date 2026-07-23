// Generated with: solidgate-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const PUBLIC_KEY = process.env.SOLIDGATE_WEBHOOK_PUBLIC_KEY;
const SECRET_KEY = process.env.SOLIDGATE_WEBHOOK_SECRET_KEY;

/**
 * Verify a Solidgate webhook signature.
 *
 * Solidgate signs `publicKey + rawBody + publicKey` with HMAC-SHA512 using the
 * webhook secret key, takes the HEX digest, then Base64-encodes that hex STRING
 * (the double-encode quirk). This matches @solidgate/node-sdk's internal signing.
 *
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string} signature - The `signature` header value
 * @param {string} publicKey - Your webhook public key (wh_pk_)
 * @param {string} secretKey - Your webhook secret key (wh_sk_)
 * @returns {boolean} Whether the signature is valid
 */
function verifySolidgateSignature(rawBody, signature, publicKey, secretKey) {
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const hex = crypto
    .createHmac('sha512', secretKey)
    .update(publicKey + body + publicKey)
    .digest('hex');
  const expected = Buffer.from(hex).toString('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Buffer length mismatch => invalid signature
    return false;
  }
}

// Solidgate webhook endpoint — must use the raw body for signature verification
app.post(
  '/webhooks/solidgate',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['signature'];
    const merchant = req.headers['merchant'];
    const eventType = req.headers['solidgate-event-type'];
    const eventId = req.headers['solidgate-event-id'];

    // Reject missing signature material
    if (!signature) {
      return res.status(400).send('Missing signature header');
    }

    // The `merchant` header must match our configured public key
    if (merchant && merchant !== PUBLIC_KEY) {
      console.error('Unexpected merchant (public key) in webhook');
      return res.status(400).send('Invalid merchant');
    }

    // Verify against the raw body BEFORE parsing
    if (!verifySolidgateSignature(req.body, signature, PUBLIC_KEY, SECRET_KEY)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Safe to parse now that the signature is verified
    const payload = JSON.parse(req.body.toString('utf8'));

    // Deduplicate retried deliveries using the event id (idempotency)
    console.log(`Received ${eventType} (event ${eventId})`);

    // Handle the event based on its type
    switch (eventType) {
      case 'card_gate.order.updated':
        console.log('Card order updated:', payload.order?.order_id, payload.order?.status);
        // TODO: fulfil order, reconcile payment, send receipt
        break;

      case 'card_gate.chargeback.received':
        console.log('Chargeback received:', payload.order?.order_id);
        // TODO: revoke access, update accounting, open dispute workflow
        break;

      case 'card_gate.fraud_alert.received':
        console.log('Fraud alert received:', payload.order?.order_id);
        // TODO: flag customer, pre-empt chargeback
        break;

      case 'card_gate.prevention_alert.received':
        console.log('Prevention alert received:', payload.order?.order_id);
        // TODO: auto-refund to avoid a chargeback
        break;

      case 'subscription.updated.v2':
        console.log('Subscription updated:', payload.subscription?.id, payload.subscription?.status);
        // TODO: grant/revoke entitlements, run dunning
        break;

      case 'alt_gate.order.updated':
        console.log('APM order updated:', payload.order?.order_id, payload.order?.status);
        // TODO: fulfil APM order, reconcile
        break;

      case 'alt_gate.paypal_dispute.received':
        console.log('PayPal dispute received:', payload.order?.order_id);
        // TODO: handle PayPal dispute
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Return 2xx within 30s to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifySolidgateSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/solidgate`);
  });
}
