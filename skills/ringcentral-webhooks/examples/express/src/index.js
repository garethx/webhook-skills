// Generated with: ringcentral-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// RingCentral notifications are JSON. The Validation-Token handshake carries no
// body, so parsing all content types (empty body -> {}) is safe here.
app.use(express.json({ type: '*/*' }));

// Optional shared secret. Set the same value as `verificationToken` when creating
// the subscription. If unset, the Verification-Token check is skipped.
const EXPECTED_TOKEN = process.env.RINGCENTRAL_VERIFICATION_TOKEN;

/**
 * Timing-safe comparison for the Verification-Token header.
 * @param {string} received - Value from the Verification-Token header
 * @param {string} expected - Your configured token
 * @returns {boolean}
 */
function tokenMatches(received, expected) {
  const a = Buffer.from(received || '', 'utf8');
  const b = Buffer.from(expected || '', 'utf8');
  // timingSafeEqual throws on length mismatch — guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Map a RingCentral event filter (the notification `event` field) to a category.
 * The filter is a resource path containing concrete IDs, so match by substring.
 * @param {string} eventFilter
 * @returns {string}
 */
function eventCategory(eventFilter) {
  if (!eventFilter) return 'unknown';
  if (eventFilter.includes('/message-store/instant')) return 'instant-message';
  if (eventFilter.includes('/message-store')) return 'message-store';
  if (eventFilter.includes('/presence')) return 'presence';
  if (eventFilter.includes('/telephony/sessions')) return 'telephony-session';
  if (eventFilter.includes('/extension')) return 'extension';
  return 'other';
}

app.post('/webhooks/ringcentral', (req, res) => {
  // 1. Validation-Token handshake (subscription create/renew).
  //    Echo the token back in the response header and return 200 fast.
  const validationToken = req.get('Validation-Token');
  if (validationToken) {
    res.set('Validation-Token', validationToken);
    return res.status(200).json({ status: 'ok' });
  }

  // 2. Verification-Token check (optional per-notification authenticity).
  if (EXPECTED_TOKEN && !tokenMatches(req.get('Verification-Token'), EXPECTED_TOKEN)) {
    console.error('Verification token mismatch');
    return res.status(401).json({ error: 'Invalid verification token' });
  }

  // 3. Parse and dispatch. Body was parsed by express.json above.
  const payload = req.body || {};
  const eventFilter = payload.event;
  const category = eventCategory(eventFilter);

  console.log(
    `Received notification for ${eventFilter} (subscription ${payload.subscriptionId})`
  );

  switch (category) {
    case 'instant-message':
      console.log('Inbound instant message (SMS):', payload.body);
      // TODO: Reply to SMS, route to an agent, etc.
      break;

    case 'message-store':
      console.log('Message store change:', payload.body?.changes);
      // TODO: Fetch the new message, log voicemail/fax, etc.
      break;

    case 'presence':
      console.log('Presence change for extension', payload.ownerId);
      // TODO: Update agent availability, dashboards, etc.
      break;

    case 'telephony-session':
      console.log('Telephony session event:', payload.body);
      // TODO: Screen-pop, call logging, analytics, etc.
      break;

    case 'extension':
      console.log('Extension change:', payload.body);
      // TODO: Sync provisioning, update directory, etc.
      break;

    default:
      console.log(`Unhandled event filter: ${eventFilter}`);
  }

  // 4. Acknowledge fast — respond within a few seconds or risk blacklisting.
  res.status(200).json({ status: 'ok' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = { app, tokenMatches, eventCategory };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ringcentral`);
  });
}
