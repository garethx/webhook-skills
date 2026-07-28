// Generated with: zift-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');

const app = express();

/**
 * Build the Zift acknowledgement body.
 *
 * Zift notifications have NO signature/HMAC header — there is nothing to
 * cryptographically verify. Instead, an endpoint acknowledges a delivery by
 * echoing the received `notificationId` back in the JSON response body. Zift
 * accepts the id as an int or a string; pass it straight through so the echoed
 * value matches what was received.
 *
 * Returning "OK", an empty body, or {"received": true} is NOT an
 * acknowledgement — Zift will retry at +5m, +15m, +60m, +24h, then mark the
 * notification "Failed".
 *
 * @param {object} payload - Parsed notification body
 * @returns {{notificationId: number|string}} - Acknowledgement body
 */
function ackBody(payload) {
  return { notificationId: payload.notificationId };
}

/**
 * Classify a notification by its eventCode prefix.
 *
 * eventCode is `category.entity-action`, e.g. "billing.subscription-created" or
 * "processing.chargeback". Dispatching on the prefix is robust even if a
 * specific suffix differs from the documented examples — confirm exact literals
 * with Zift support at onboarding.
 *
 * @param {unknown} eventCode
 * @returns {'billing'|'processing'|'unknown'}
 */
function eventCategory(eventCode) {
  if (typeof eventCode !== 'string') return 'unknown';
  const category = eventCode.split('.')[0];
  return category === 'billing' || category === 'processing' ? category : 'unknown';
}

// No body signature to protect, so ordinary JSON parsing is safe here.
app.post('/webhooks/zift', express.json(), (req, res) => {
  const payload = req.body || {};

  // Without a notificationId we cannot acknowledge the delivery. Surface the
  // misdelivery with a 400 rather than silently returning 200.
  if (payload.notificationId === undefined || payload.notificationId === null) {
    console.error('Zift notification missing notificationId');
    return res.status(400).json({ error: 'Missing notificationId' });
  }

  const category = eventCategory(payload.eventCode);

  console.log(
    `Received Zift notification ${payload.notificationId} (${payload.eventCode})`
  );

  // Dispatch on the event category, then branch on the specific eventCode.
  // Make handling idempotent — a retry may redeliver a notification you already
  // processed (dedupe on notificationId before side effects).
  switch (category) {
    case 'billing':
      console.log('Billing event:', payload.eventCode, 'dataType:', payload.dataType);
      // TODO: update subscription / payment option / allocation records.
      break;

    case 'processing':
      console.log('Processing event:', payload.eventCode, 'dataType:', payload.dataType);
      // TODO: handle chargeback / return / reversal / NOC (ACH detail in data).
      break;

    default:
      console.log(`Unhandled eventCode: ${payload.eventCode}`);
  }

  // Acknowledge by echoing the notificationId. THIS is the ack.
  res.status(200).json(ackBody(payload));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = { app, ackBody, eventCategory };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/zift`);
  });
}
