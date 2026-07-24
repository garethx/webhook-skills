// Generated with: pylon-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Pylon webhook signature.
 *
 * Pylon signs `timestamp + "." + rawBody` with HMAC-SHA256 and sends the result
 * in the Pylon-Webhook-Signature header, prefixed with "hs256=".
 *
 * @param {Buffer} rawBody - Raw, unparsed request body
 * @param {string} timestamp - Pylon-Webhook-Timestamp header (unix seconds)
 * @param {string} signatureHeader - Pylon-Webhook-Signature header ("hs256=<hex>")
 * @param {string} secret - Destination signing secret
 * @returns {boolean}
 */
function verifyPylonWebhook(rawBody, timestamp, signatureHeader, secret) {
  if (!signatureHeader || !timestamp) {
    return false;
  }

  // Signed content is `timestamp + "." + rawBody`, hex digest, "hs256=" prefix.
  const expected = 'hs256=' + crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; timingSafeEqual throws on length mismatch.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Pylon webhook endpoint - must use raw body for signature verification
app.post('/webhooks/pylon',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['pylon-webhook-signature'];
    const timestamp = req.headers['pylon-webhook-timestamp'];
    const version = req.headers['pylon-webhook-version'];

    // Verify webhook signature against the raw body
    if (!verifyPylonWebhook(req.body, timestamp, signature, process.env.PYLON_WEBHOOK_SECRET)) {
      console.error('Pylon webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification succeeds
    const payload = JSON.parse(req.body.toString());

    // NOTE: Pylon's event-type field and token format are not publicly
    // documented. Confirm these against your own destination configuration.
    const eventType = payload.event_type || payload.type;
    const data = payload.data || payload;

    console.log(`Received Pylon event: ${eventType} (version: ${version})`);

    // Handle the event based on type (event names are illustrative)
    switch (eventType) {
      case 'issue.created':
        console.log('Issue created:', data.id, data.title);
        // TODO: Mirror the issue, alert on-call, create a linked task, etc.
        break;

      case 'issue.updated':
        console.log('Issue updated:', data.id, data.state);
        // TODO: Sync fields, trigger SLA automations, etc.
        break;

      case 'issue.closed':
        console.log('Issue closed:', data.id);
        // TODO: Send CSAT survey, update reporting, close linked tasks, etc.
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Return 2xx quickly to acknowledge receipt (Pylon times out after ~10s)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyPylonWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pylon`);
  });
}
