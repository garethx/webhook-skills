// Generated with: microsoft-sharepoint-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

// SharePoint notifications have no signature, so the raw body is not needed for
// crypto — but capturing it as text keeps parsing explicit and avoids surprises
// on the empty-body validation request.
app.use(express.text({ type: '*/*' }));

const CLIENT_STATE = process.env.SHAREPOINT_CLIENT_STATE;

// ChangeType values returned by the list GetChanges API (the notification itself
// carries no change details — these describe what you find once you call it).
const CHANGE_TYPES = {
  Add: 'ItemAdded',
  Update: 'ItemUpdated',
  DeleteObject: 'ItemDeleted',
  Rename: 'ItemRenamed',
  Restore: 'ItemRestored',
  MoveAway: 'ItemMovedOut',
  MoveInto: 'ItemMovedInto',
};

// Timing-safe compare of the clientState shared secret.
function clientStateMatches(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

app.post('/webhooks/microsoft-sharepoint', async (req, res) => {
  // 1. Validation handshake — echo the validationtoken back as text/plain.
  //    This MUST happen before any body parsing and within ~5 seconds, or the
  //    subscription is never created.
  const validationToken = req.query.validationtoken;
  if (validationToken) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(String(validationToken));
  }

  // 2. Parse the thin, batched notification payload.
  let notifications;
  try {
    const parsed = req.body ? JSON.parse(req.body) : {};
    notifications = Array.isArray(parsed.value) ? parsed.value : [];
  } catch (err) {
    console.error('Invalid notification body:', err.message);
    return res.status(400).send('Invalid JSON body');
  }

  // 3. Validate the clientState shared secret on every notification.
  const allValid = notifications.every((n) =>
    clientStateMatches(n.clientState, CLIENT_STATE)
  );
  if (!allValid) {
    console.error('clientState validation failed');
    return res.status(400).send('Invalid clientState');
  }

  // 4. Acknowledge quickly, then process asynchronously. SharePoint retries 5x
  //    at 5-minute intervals on any non-2xx response or timeout.
  for (const n of notifications) {
    console.log(
      `Change in list ${n.resource} (subscription ${n.subscriptionId}, site ${n.siteUrl})`
    );
    // TODO: enqueue GetChanges for list `n.resource` using your stored change
    // token, then map each returned change via CHANGE_TYPES, e.g.:
    //   CHANGE_TYPES[change.ChangeType]  // 'ItemAdded', 'ItemUpdated', ...
    // Persist the new change token for the next notification.
  }

  // Return 200 to acknowledge receipt.
  return res.status(200).json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;
module.exports.CHANGE_TYPES = CHANGE_TYPES;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(
      `Webhook endpoint: POST http://localhost:${PORT}/webhooks/microsoft-sharepoint`
    );
  });
}
