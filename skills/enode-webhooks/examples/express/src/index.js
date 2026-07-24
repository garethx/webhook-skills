// Generated with: enode-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Enode webhook signature.
 *
 * Enode signs the RAW request body with HMAC-SHA1 keyed on the per-webhook
 * secret you generated, and sends it in the `x-enode-signature` header
 * formatted as `sha1=<hex>`.
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - x-enode-signature header value
 * @param {string} secret - Your Enode webhook secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyEnodeWebhook(rawBody, signatureHeader, secret) {
  // Header format: sha1=<hex>
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha1' || !sig) {
    return false;
  }

  // Compute expected HMAC-SHA1 over the raw body, hex-encoded
  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; returns false on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Dispatch a single Enode event. The webhook body is an ARRAY of events,
 * so this is called once per element.
 */
function handleEnodeEvent(evt) {
  switch (evt.event) {
    case 'enode:webhook:test':
      console.log('Test webhook received — receiver is reachable');
      break;

    case 'system:heartbeat':
      console.log('Heartbeat received at', evt.createdAt);
      break;

    case 'user:vehicle:updated':
      console.log(`Vehicle updated for user ${evt.user?.id}:`, evt.vehicle?.id);
      // TODO: Sync charge state, battery level, location, etc.
      break;

    case 'user:vehicle:discovered':
      console.log(`Vehicle discovered for user ${evt.user?.id}:`, evt.vehicle?.id);
      // TODO: Onboard the new device, backfill data
      break;

    case 'user:charger:updated':
      console.log(`Charger updated for user ${evt.user?.id}:`, evt.charger?.id);
      // TODO: Sync charging status, availability
      break;

    case 'user:battery:updated':
      console.log(`Battery updated for user ${evt.user?.id}:`, evt.battery?.id);
      // TODO: Track state of charge, power flow
      break;

    case 'user:credentials:invalidated':
      console.log(`Credentials invalidated for user ${evt.user?.id}`);
      // TODO: Prompt the user to re-link their vendor account
      break;

    default:
      console.log(`Unhandled event: ${evt.event}`);
  }
}

// Enode webhook endpoint - must use raw body for signature verification
app.post('/webhooks/enode',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-enode-signature'];
    const deliveryId = req.headers['x-enode-delivery'];

    // Verify webhook signature against the RAW body
    if (!verifyEnodeWebhook(req.body, signature, process.env.ENODE_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification - Enode sends an ARRAY of events
    let events;
    try {
      events = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    if (!Array.isArray(events)) {
      return res.status(400).send('Expected an array of events');
    }

    console.log(`Received ${events.length} event(s) (delivery: ${deliveryId})`);

    for (const evt of events) {
      handleEnodeEvent(evt);
    }

    // Return 200 quickly to acknowledge receipt (Enode times out after 5s)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyEnodeWebhook, handleEnodeEvent };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/enode`);
  });
}
