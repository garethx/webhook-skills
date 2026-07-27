// Generated with: paymob-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Build the ordered string Paymob signs, from a transaction object.
 * The 20 fields are concatenated in a fixed order with no separators.
 * Array.join renders booleans as "true"/"false" and numbers as their digits,
 * which matches Paymob's JSON serialization.
 *
 * @param {object} obj - The `obj` (transaction) field from the callback body
 * @returns {string}
 */
function buildSignedString(obj) {
  const s = obj.source_data || {};
  return [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    obj.order.id,
    obj.owner,
    obj.pending,
    s.pan,
    s.sub_type,
    s.type,
    obj.success,
  ].join('');
}

/**
 * Verify a Paymob Transaction Processed Callback (POST).
 * Paymob computes HMAC-SHA512 (hex) over the concatenated fields above and
 * sends it as the `hmac` query parameter (NOT a header, NOT the raw body).
 *
 * @param {object} obj - Transaction object (request body `obj`)
 * @param {string} hmacParam - Value of the `?hmac=` query parameter
 * @param {string} secret - Paymob HMAC secret
 * @returns {boolean}
 */
function verifyPaymobHmac(obj, hmacParam, secret) {
  const expected = crypto
    .createHmac('sha512', secret)
    .update(buildSignedString(obj))
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(hmacParam || '')
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

/**
 * Derive a human-readable transaction state from the boolean fields.
 * Paymob has no discrete event names — every callback `type` is "TRANSACTION".
 */
function transactionState(obj) {
  if (obj.is_refunded) return 'refunded';
  if (obj.is_voided) return 'voided';
  if (obj.pending) return 'pending';
  if (obj.success && obj.is_auth && !obj.is_capture) return 'authorized';
  if (obj.is_capture) return 'captured';
  if (obj.success && !obj.error_occured) return 'succeeded';
  return 'failed';
}

// Paymob POSTs JSON. We parse it (verification needs the fields), then verify.
app.post('/webhooks/paymob', express.json({ type: '*/*' }), (req, res) => {
  const hmacParam = req.query.hmac;
  const body = req.body || {};

  if (body.type !== 'TRANSACTION' || !body.obj) {
    return res.status(400).send('Unexpected callback payload');
  }

  const obj = body.obj;

  if (!hmacParam || !verifyPaymobHmac(obj, hmacParam, process.env.PAYMOB_HMAC_SECRET)) {
    console.error('Paymob HMAC verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Signature is valid — act on the transaction state.
  const state = transactionState(obj);
  console.log(`Transaction ${obj.id} (order ${obj.order.id}): ${state}`);

  switch (state) {
    case 'succeeded':
      // TODO: mark order paid, fulfil, send receipt
      break;
    case 'failed':
      // TODO: notify customer, release reservation
      break;
    case 'pending':
      // TODO: await final callback (e.g. 3-D Secure)
      break;
    case 'authorized':
      // TODO: funds held; capture when ready
      break;
    case 'captured':
      // TODO: complete a prior authorization
      break;
    case 'refunded':
      // TODO: reverse fulfilment, credit customer
      break;
    case 'voided':
      // TODO: cancel an uncaptured authorization
      break;
    default:
      console.log(`Unhandled state for transaction ${obj.id}`);
  }

  // Acknowledge quickly so Paymob does not retry.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyPaymobHmac, buildSignedString, transactionState };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paymob`);
  });
}
