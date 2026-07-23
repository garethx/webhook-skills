// Generated with: meraki-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Cisco Meraki webhook.
 *
 * Meraki does NOT sign webhooks with an HMAC header. Instead it echoes the
 * "Shared secret" you configured on the HTTP server back inside the JSON body
 * as `sharedSecret`. Verification is a timing-safe string compare on that field.
 * TLS (HTTPS with a CA-trusted cert) is the real transport protection.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} secret - Configured shared secret (MERAKI_WEBHOOK_SECRET)
 * @returns {boolean} - Whether the payload's sharedSecret matches
 */
function verifyMerakiWebhook(rawBody, secret) {
  let payload;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    return false;
  }

  const received = Buffer.from(String(payload.sharedSecret ?? ''));
  const expected = Buffer.from(String(secret ?? ''));

  // timingSafeEqual throws if lengths differ — guard first.
  if (received.length !== expected.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

// Meraki webhook endpoint - use the raw body so we control JSON parsing/verification.
app.post('/webhooks/meraki',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    // Verify the shared secret (carried in the body, not a header)
    if (!verifyMerakiWebhook(req.body, process.env.MERAKI_WEBHOOK_SECRET)) {
      console.error('Meraki webhook verification failed');
      return res.status(401).send('Invalid shared secret');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString());
    const alertTypeId = payload.alertTypeId;

    console.log(
      `Received "${payload.alertType}" (${alertTypeId}) for network ${payload.networkName} (alertId: ${payload.alertId})`
    );

    // Dispatch on alertTypeId (stable id), not alertType (human label)
    switch (alertTypeId) {
      case 'motion_alert':
        console.log(`Motion detected on device ${payload.deviceSerial}`);
        // TODO: capture snapshot, notify security, etc.
        break;

      case 'settings_changed':
        console.log(`Settings changed in ${payload.networkName}`);
        // TODO: audit the change, alert compliance, etc.
        break;

      case 'sensor_alert':
        console.log(`Sensor alert on ${payload.deviceSerial}:`, payload.alertData);
        // TODO: create incident, page facilities, etc.
        break;

      case 'stopped_reporting':
        console.log(`Device(s) stopped reporting in ${payload.networkName}`);
        // TODO: open uptime incident, page on-call, etc.
        break;

      default:
        console.log(`Unhandled alert type: ${alertTypeId}`);
    }

    // Return 200 quickly to acknowledge receipt (avoid auto-disable)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyMerakiWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/meraki`);
  });
}
