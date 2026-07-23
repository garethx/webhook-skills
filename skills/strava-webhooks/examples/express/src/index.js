// Generated with: strava-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

// Strava event payloads are plain JSON with no signature to verify against a
// raw body, so the standard JSON parser is fine here.
app.use(express.json());

const VERIFY_TOKEN = process.env.STRAVA_VERIFY_TOKEN;
const SUBSCRIPTION_ID = process.env.STRAVA_SUBSCRIPTION_ID; // optional

/**
 * Timing-safe comparison of the verify token from the validation handshake.
 * crypto.timingSafeEqual throws on length mismatch, so guard on length first.
 */
function tokenMatches(received, expected) {
  const a = Buffer.from(received || '');
  const b = Buffer.from(expected || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Subscription validation handshake.
// Strava sends: GET /webhooks/strava?hub.mode=subscribe
//   &hub.verify_token=<your token>&hub.challenge=<random>
// Respond 200 with {"hub.challenge": "<echoed value>"} within 2 seconds.
app.get('/webhooks/strava', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && tokenMatches(token, VERIFY_TOKEN)) {
    // The response key must be the literal string "hub.challenge" (with the dot).
    return res.status(200).json({ 'hub.challenge': challenge });
  }

  return res.status(403).send('Forbidden');
});

// Event delivery. Strava events are NOT signed — trust is established by the
// validation handshake and (optionally) by checking the subscription_id.
app.post('/webhooks/strava', (req, res) => {
  const event = req.body;

  // Optional: reject events that aren't from our subscription.
  if (SUBSCRIPTION_ID && String(event.subscription_id) !== String(SUBSCRIPTION_ID)) {
    return res.status(403).send('Unknown subscription');
  }

  // Acknowledge quickly (within Strava's 2s window) before doing real work.
  res.status(200).json({ received: true });

  // Dispatch by object_type + aspect_type (there is no single event-name field).
  const { object_type, aspect_type, object_id, owner_id, updates } = event;

  switch (`${object_type}:${aspect_type}`) {
    case 'activity:create':
      console.log(`Activity created: ${object_id} (athlete ${owner_id})`);
      // TODO: fetch the activity from the Strava REST API using object_id.
      break;

    case 'activity:update':
      console.log(`Activity updated: ${object_id}`, updates);
      // TODO: re-sync cached activity metadata (title/type/private).
      break;

    case 'activity:delete':
      console.log(`Activity deleted: ${object_id}`);
      // TODO: remove the activity from your store.
      break;

    case 'athlete:update':
      if (updates && updates.authorized === 'false') {
        console.log(`Athlete ${owner_id} deauthorized the app`);
        // TODO: revoke tokens and stop syncing this athlete.
      } else {
        console.log(`Athlete ${owner_id} updated`, updates);
      }
      break;

    default:
      console.log(`Unhandled event: ${object_type}:${aspect_type}`);
  }
});

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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/strava`);
    console.log(`Validation endpoint: GET http://localhost:${PORT}/webhooks/strava`);
  });
}
