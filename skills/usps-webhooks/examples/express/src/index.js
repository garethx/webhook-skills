// Generated with: usps-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a USPS webhook signature.
 *
 * USPS signs `timestamp + payload` (the envelope's `timestamp` field
 * concatenated with the raw, stringified `payload` field) with HMAC-SHA256
 * keyed on the subscription `secret`, and sends the Base64 digest in the
 * `X-HMAC` header (deprecated alias: `hmac-header`).
 *
 * @param {string} timestamp - Envelope `timestamp` field
 * @param {string} payload - Envelope `payload` field (raw stringified JSON, unmodified)
 * @param {string} hmacHeader - X-HMAC header value
 * @param {string} secret - 32-char subscription secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyUspsSignature(timestamp, payload, hmacHeader, secret) {
  if (!hmacHeader) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + payload)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected));
  } catch {
    return false; // buffer length mismatch = invalid
  }
}

// USPS webhook endpoint - must use the raw body to reconstruct the signed content
app.post('/webhooks/usps',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const hmacHeader = req.headers['x-hmac'] || req.headers['hmac-header'];

    // Parse the envelope so we can read the signed fields (timestamp + payload).
    // The inner `payload` is used verbatim for verification - never re-serialize it.
    let envelope;
    try {
      envelope = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const { subscriptionType, timestamp, payload } = envelope;

    // Verify the signature over `timestamp + payload`
    if (!verifyUspsSignature(timestamp, payload, hmacHeader, process.env.USPS_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Only now is it safe to parse the inner payload
    let tracking;
    try {
      tracking = JSON.parse(payload);
    } catch {
      return res.status(400).send('Invalid payload');
    }

    console.log(`Received ${subscriptionType} notification (${envelope.subscriptionId})`);

    // Dispatch on subscription type (currently only TRACKING)
    switch (subscriptionType) {
      case 'TRACKING':
        handleTrackingEvent(tracking);
        break;
      default:
        console.log(`Unhandled subscriptionType: ${subscriptionType}`);
    }

    // Acknowledge quickly. USPS has no documented retry - do heavy work async.
    res.status(200).send('OK');
  }
);

/**
 * Handle a TRACKING notification payload, dispatching on tracking status.
 */
function handleTrackingEvent(tracking) {
  const status = tracking.status;
  console.log(`Tracking ${tracking.trackingNumber}: ${status}`);

  switch (status) {
    case 'Pre-Shipment':
      // TODO: Show "label created" in the customer's order status
      break;
    case 'Accepted':
      // TODO: Mark order as shipped / in-network
      break;
    case 'In Transit':
      // TODO: Update ETA / live tracking timeline
      break;
    case 'Out for Delivery':
      // TODO: Send "arriving today" notification
      break;
    case 'Delivered':
      // TODO: Close the shipment, request a review, release funds
      break;
    case 'Available for Pickup':
      // TODO: Notify customer to collect the package
      break;
    case 'Delivery Attempt':
      // TODO: Prompt customer to reschedule / update address
      break;
    case 'Alert':
      // TODO: Alert support, notify customer of a delay
      break;
    default:
      console.log(`Unhandled tracking status: ${status}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyUspsSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/usps`);
  });
}
