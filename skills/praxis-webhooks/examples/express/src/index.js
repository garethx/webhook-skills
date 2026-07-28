// Generated with: praxis-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

const MERCHANT_SECRET = process.env.PRAXIS_MERCHANT_SECRET;

// Fixed field order per notification type. Praxis concatenates these VALUES (in
// this order, NOT alphabetized), appends the Merchant Secret, then SHA-384s it.
const PAYMENT_FIELDS = [
  'merchant_id',
  'application_key',
  'timestamp',
  'customer.customer_token',
  'session.order_id',
  'transaction.tid',
  'transaction.currency',
  'transaction.amount',
  'transaction.conversion_rate',
  'transaction.processed_currency',
  'transaction.processed_amount',
];
const SUBSCRIPTION_FIELDS = [
  'event',
  'merchant_id',
  'application_key',
  'cid',
  'plan_id',
  'subscription_id',
  'subscription_status',
  'timestamp',
];

// Read a (possibly nested) dot-path value from the parsed body.
const at = (obj, path) =>
  path.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);

/**
 * Verify the inbound `gt-authentication` signature.
 *
 * Praxis signs a fixed list of field VALUES: concatenate them in the documented
 * order, append the Merchant Secret, and SHA-384 the result (hex). This is NOT
 * an HMAC and NOT Standard Webhooks. A Subscription Notification carries an
 * `event` field; a Payment Notification does not.
 */
function verifyPraxis(body, headerSig, merchantSecret) {
  const fields = body.event ? SUBSCRIPTION_FIELDS : PAYMENT_FIELDS;
  const data = fields.map((p) => String(at(body, p) ?? '')).join('') + merchantSecret;
  const expected = crypto.createHash('sha384').update(data, 'utf8').digest('hex');
  const a = Buffer.from(String(headerSig || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Build the signed acknowledgement Praxis expects: HTTP 200, a `{ status: 0 }`
 * body, and an `external-request-signature` header over `status + timestamp +
 * secret`. A missing/incorrect signature makes Praxis retry the delivery.
 */
function acknowledge(res, merchantSecret) {
  const status = 0;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha384')
    .update(`${status}${timestamp}${merchantSecret}`, 'utf8')
    .digest('hex');
  return res
    .set('external-request-signature', signature)
    .status(200)
    .json({ status, timestamp });
}

/** Dispatch on the notification type and its status. */
function handleNotification(body) {
  if (body.event) {
    // Subscription Notification — identified by the `event` field. See the
    // Common Event Types table in SKILL.md for the full set. subscription_status
    // is one of active, inactive, expired, canceled.
    switch (body.event) {
      case 'SubscriptionCreated':
      case 'SubscriptionActivated':
      case 'SubscriptionDeactivated':
      case 'SubscriptionExpired':
      case 'SubscriptionCanceled':
        console.log(
          `Subscription lifecycle: event=${body.event} ` +
            `status=${body.subscription_status} subscription_id=${body.subscription_id}`
        );
        // TODO: update the local subscription record.
        break;
      case 'PaymentAttemptApproved':
      case 'PaymentSucceeded':
      case 'PaymentManuallyPaid':
      case 'PaymentRefundSucceeded':
        console.log(`Subscription payment ok: event=${body.event} subscription_id=${body.subscription_id}`);
        // TODO: extend access / record the payment.
        break;
      case 'PaymentAttemptFailed':
      case 'PaymentFailed':
      case 'PaymentRefundFailed':
        console.log(`Subscription payment problem: event=${body.event} subscription_id=${body.subscription_id}`);
        // TODO: dunning / alert the customer.
        break;
      default:
        console.log(`Unhandled subscription event: ${body.event}`);
    }
    return;
  }

  // Payment Notification — dispatch on transaction.transaction_status.
  const status = at(body, 'transaction.transaction_status');
  const tid = at(body, 'transaction.tid');
  switch (status) {
    case 'initialized':
      console.log(`Payment initialized: tid=${tid}`);
      // TODO: record the transaction as created.
      break;
    case 'pending':
      console.log(`Payment pending: tid=${tid}`);
      // TODO: mark the order as processing.
      break;
    case 'approved':
      console.log(`Payment approved: tid=${tid}`);
      // TODO: fulfil the order, grant access, send a receipt.
      break;
    case 'rejected':
      console.log(`Payment rejected: tid=${tid}`);
      // TODO: prompt the customer to retry / use another method.
      break;
    case 'error':
      console.log(`Payment error: tid=${tid}`);
      // TODO: log and alert for investigation.
      break;
    default:
      console.log(`Unhandled transaction_status: ${status}`);
  }
}

// Capture the RAW body. Praxis signs field VALUES (not the raw body), so we still
// parse the JSON ourselves to rebuild the signed string — but keeping the raw
// buffer lets us control parsing and reject malformed JSON cleanly.
app.post('/webhooks/praxis', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const headerSig = req.get('gt-authentication');

  if (!headerSig) {
    return res.status(400).json({ error: 'Missing gt-authentication header' });
  }

  // 1) Parse the JSON (required to rebuild the signed field-value string).
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 2) Verify the SHA-384 signature over the field values + Merchant Secret.
  if (!verifyPraxis(body, headerSig, MERCHANT_SECRET)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // 3) Handle the notification.
  try {
    handleNotification(body);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // 4) Reply 200 with a signed { status: 0 } acknowledgement.
  return acknowledge(res, MERCHANT_SECRET);
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Listening for Praxis webhooks on :${PORT}`));
}

module.exports = app;
