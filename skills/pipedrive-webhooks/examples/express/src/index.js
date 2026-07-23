// Generated with: pipedrive-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const WEBHOOK_USER = process.env.PIPEDRIVE_WEBHOOK_USER;
const WEBHOOK_PASSWORD = process.env.PIPEDRIVE_WEBHOOK_PASSWORD;

/**
 * Timing-safe string comparison. crypto.timingSafeEqual throws when the two
 * buffers differ in length, so we length-check first (and return false).
 */
function safeEqual(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Pipedrive does NOT sign webhooks (no HMAC, no signature header). It sends the
 * credentials you configured (http_auth_user / http_auth_password) as HTTP Basic
 * Auth on every delivery. Verify them here.
 */
function verifyBasicAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // password may itself contain ':'
  if (sep === -1) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return safeEqual(user, WEBHOOK_USER) && safeEqual(pass, WEBHOOK_PASSWORD);
}

// Basic Auth doesn't depend on the raw body, so normal JSON parsing is fine.
app.post('/webhooks/pipedrive', express.json({ type: '*/*' }), (req, res) => {
  // 1. Authenticate the delivery
  if (!verifyBasicAuth(req.headers['authorization'])) {
    console.error('Pipedrive webhook authentication failed');
    return res.status(401).send('Unauthorized');
  }

  // 2. Validate payload structure
  const { meta, data, previous } = req.body || {};
  if (!meta || !meta.action || !meta.entity) {
    return res.status(400).send('Invalid payload structure');
  }

  // 3. Build the v2 event type from meta.action + meta.entity
  const event = `${meta.action}.${meta.entity}`;
  console.log(`Received ${event} (correlation_id=${meta.correlation_id})`);

  // 4. Dispatch on the event type
  switch (event) {
    case 'create.deal':
      console.log('Deal created:', data && data.id);
      // TODO: sync new deal, notify sales, etc.
      break;

    case 'change.deal':
      console.log('Deal changed:', data && data.id, 'changed fields:', previous);
      // TODO: react to stage/value/owner changes
      break;

    case 'delete.deal':
      console.log('Deal deleted:', meta.entity_id);
      // TODO: remove records, audit trail
      break;

    case 'change.person':
      console.log('Person changed:', data && data.id);
      // TODO: keep contact records in sync
      break;

    case 'create.activity':
      console.log('Activity created:', data && data.id);
      // TODO: trigger reminders, calendar sync
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // 5. Acknowledge quickly with any 2XX (do heavy work asynchronously)
  res.json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pipedrive`);
  });
}
