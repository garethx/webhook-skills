// Generated with: quoter-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

const HASH_KEY = process.env.QUOTER_HASH_KEY;
const MAX_AGE_SECONDS = 300; // reject requests older than 5 minutes

/**
 * Verify a Quoter webhook.
 *
 * Quoter POSTs application/x-www-form-urlencoded with three fields:
 *   hash, timestamp, data
 * The `hash` is md5(HASH_KEY + timestamp + data), where `data` is the raw
 * JSON/XML string exactly as sent. NOTE: this is a weak MD5 scheme, NOT
 * HMAC-SHA256 and NOT Standard Webhooks. Always configure a hash key.
 */
function verifyQuoter(hashKey, timestamp, data, receivedHash) {
  if (!hashKey) return false; // no shared secret configured = cannot verify
  if (!timestamp || !data || !receivedHash) return false;

  // Reject stale requests (timestamp is GMT UNIX seconds)
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) return false;

  // Hash the `data` string exactly as received — never re-serialize it.
  const expected = crypto
    .createHash('md5')
    .update(hashKey + timestamp + data)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedHash));
  } catch {
    return false; // buffer length mismatch = invalid
  }
}

// Quoter sends form-urlencoded, so parse the form body (not JSON).
app.post('/webhooks/quoter', express.urlencoded({ extended: false }), (req, res) => {
  const { hash, timestamp, data } = req.body;

  if (!hash || !timestamp || !data) {
    return res.status(400).send('Missing hash, timestamp, or data');
  }

  if (!verifyQuoter(HASH_KEY, timestamp, data, hash)) {
    console.error('Quoter webhook verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Verified — now it's safe to parse the payload string.
  let payload;
  try {
    payload = JSON.parse(data); // use an XML parser if you chose XML format
  } catch (err) {
    return res.status(400).send('Invalid JSON in data field');
  }

  // Quoter has no dotted event names and the request doesn't identify the
  // object type, so we read it from the ?object= query parameter (configure a
  // distinct target URL per object type, e.g. /webhooks/quoter?object=quote).
  // Each object type fires on both create and update; there's no documented
  // field to tell them apart, so process idempotently keyed on payload.id.
  const objectType = req.query.object || 'unknown';

  switch (objectType) {
    case 'quote':
      console.log('Quote received:', payload.id ?? '(no id)');
      // TODO: sync the quote (e.g. trigger fulfillment when accepted).
      break;
    case 'person':
      console.log('Person received:', payload.id ?? '(no id)');
      // TODO: sync the contact to your CRM.
      break;
    case 'payment':
      console.log('Payment received:', payload.id ?? '(no id)');
      // TODO: reconcile the payment.
      break;
    default:
      console.log('Quoter object received (unknown type):', payload.id ?? '(no id)');
  }

  // Acknowledge quickly with a 2xx.
  res.status(200).json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app + helper for testing
module.exports = app;
module.exports.verifyQuoter = verifyQuoter;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/quoter`);
  });
}
