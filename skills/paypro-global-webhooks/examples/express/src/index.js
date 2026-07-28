// Generated with: paypro-global-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// VALIDATION_KEY verifies the SIGNATURE (SHA256). SECRET_KEY verifies the HASH
// (MD5). They are DIFFERENT keys on the same dashboard tab (Store Settings →
// General Settings → Integration). The SIGNATURE is the primary check; the HASH
// check runs only when PAYPRO_SECRET_KEY is configured.
const VALIDATION_KEY = process.env.PAYPRO_VALIDATION_KEY;
const SECRET_KEY = process.env.PAYPRO_SECRET_KEY;

if (!VALIDATION_KEY) {
  console.warn(
    'PAYPRO_VALIDATION_KEY is not set — SIGNATURE verification will fail. ' +
      'Set it from Store Settings → General Settings → Integration (Validation Key).'
  );
}

const app = express();

/**
 * Timing-safe hex comparison (case-insensitive). Hex digests are fixed length
 * (SHA256 = 64, MD5 = 32), but we still length-check to avoid throwing.
 */
function timingSafeEqualHex(a, b) {
  const ab = Buffer.from(String(a).toLowerCase());
  const bb = Buffer.from(String(b).toLowerCase());
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify the PayPro Global SIGNATURE (SHA256) — the primary check.
 *
 * SIGNATURE = SHA256(ORDER_ID + ORDER_STATUS + ORDER_TOTAL_AMOUNT +
 *   CUSTOMER_EMAIL + VALIDATION_KEY + TEST_MODE + IPN_TYPE_NAME), hex.
 *
 * The exact field order — and appending TEST_MODE and IPN_TYPE_NAME at the end —
 * is easy to get wrong. The signature covers specific field VALUES, not the raw
 * body, so recomputing from parsed form fields is correct here.
 */
function verifySignature(f, validationKey) {
  if (!validationKey || !f.SIGNATURE) return false;
  const base =
    `${f.ORDER_ID ?? ''}${f.ORDER_STATUS ?? ''}${f.ORDER_TOTAL_AMOUNT ?? ''}` +
    `${f.CUSTOMER_EMAIL ?? ''}${validationKey}${f.TEST_MODE ?? ''}${f.IPN_TYPE_NAME ?? ''}`;
  const expected = crypto.createHash('sha256').update(base, 'utf8').digest('hex');
  return timingSafeEqualHex(expected, f.SIGNATURE);
}

/**
 * Verify the PayPro Global HASH (MD5) — legacy/secondary check.
 *
 * HASH = MD5(ORDER_ID + SecretKey) for real orders, or MD5("1") for test orders
 * (TEST_MODE === '1'). Uses the SECRET_KEY, which is DIFFERENT from the
 * VALIDATION_KEY used by SIGNATURE.
 */
function verifyHash(f, secretKey) {
  if (!secretKey || !f.HASH) return false;
  const isTest = String(f.TEST_MODE) === '1';
  const base = isTest ? '1' : `${f.ORDER_ID ?? ''}${secretKey}`;
  const expected = crypto.createHash('md5').update(base, 'utf8').digest('hex');
  return timingSafeEqualHex(expected, f.HASH);
}

// Fixed PayPro Global source IPs. Enforcing this is optional defence-in-depth —
// prefer doing it at your firewall/load balancer where the real client IP is
// reliable (behind proxies, req.ip may be the proxy).
const PAYPRO_IPS = new Set([
  '198.199.123.239',
  '157.230.8.40',
  '2604:a880:400:d0::1843:7001',
  '2604:a880:400:d1::b6c:c001',
]);

// PayPro Global sends the event name in IPN_TYPE_NAME. Note the non-standard
// spelling "SubscriptionChargeSucceed" (not "Succeeded").
function handleEvent(f) {
  switch (f.IPN_TYPE_NAME) {
    case 'OrderCharged':
      console.log(`Order ${f.ORDER_ID} charged (${f.ORDER_TOTAL_AMOUNT})`);
      // TODO: fulfil order, grant access, deliver license.
      break;
    case 'OrderRefunded':
    case 'OrderPartiallyRefunded':
      console.log(`Order ${f.ORDER_ID} refunded (${f.IPN_TYPE_NAME})`);
      // TODO: revoke/adjust access, update accounting.
      break;
    case 'OrderChargedBack':
      console.log(`Order ${f.ORDER_ID} charged back`);
      // TODO: suspend account, gather evidence.
      break;
    case 'SubscriptionChargeSucceed':
    case 'SubscriptionRenewed':
      console.log(`Subscription for order ${f.ORDER_ID} extended (${f.IPN_TYPE_NAME})`);
      // TODO: extend subscription period.
      break;
    case 'SubscriptionChargeFailed':
      console.log(`Subscription charge failed for order ${f.ORDER_ID}`);
      // TODO: dunning, notify customer.
      break;
    case 'SubscriptionTerminated':
    case 'SubscriptionSuspended':
    case 'SubscriptionFinished':
      console.log(`Subscription ended for order ${f.ORDER_ID} (${f.IPN_TYPE_NAME})`);
      // TODO: revoke/pause access.
      break;
    default:
      console.log(`Unhandled IPN_TYPE_NAME: ${f.IPN_TYPE_NAME}`);
  }
}

// PayPro Global posts application/x-www-form-urlencoded — parse it as form data.
// The SIGNATURE covers field values (not the raw body), so parsing first is fine.
app.post('/webhooks/paypro-global', express.urlencoded({ extended: false }), (req, res) => {
  const f = req.body || {};

  // Layer 1 (optional): restrict to PayPro Global's fixed source IPs.
  if (process.env.PAYPRO_ENFORCE_IP === 'true' && !PAYPRO_IPS.has(req.ip)) {
    console.error(`Rejected IPN from non-allowlisted IP: ${req.ip}`);
    return res.status(403).send('Forbidden');
  }

  // Layer 2 (primary): SIGNATURE (SHA256).
  if (!verifySignature(f, VALIDATION_KEY)) {
    console.error('PayPro Global SIGNATURE verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Layer 3 (optional): HASH (MD5). Enforced only when a secret key is set.
  if (SECRET_KEY && !verifyHash(f, SECRET_KEY)) {
    console.error('PayPro Global HASH verification failed');
    return res.status(400).send('Invalid hash');
  }

  console.log(`Verified IPN ${f.IPN_TYPE_NAME} for order ${f.ORDER_ID}`);
  handleEvent(f);

  // Acknowledge with 200 — anything else triggers PayPro Global's retries
  // (every 30 minutes, up to 3 attempts).
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = { app, verifySignature, verifyHash, PAYPRO_IPS };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paypro-global`);
  });
}
