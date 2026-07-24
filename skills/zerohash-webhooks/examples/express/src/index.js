// Generated with: zerohash-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const webhookSecret = process.env.ZEROHASH_WEBHOOK_SECRET;

// Reject timestamps older/newer than this to guard against replay attacks.
const TOLERANCE_MS = 5 * 60 * 1000; // ±5 minutes

/**
 * Normalize x-zh-hook-timestamp to milliseconds.
 *
 * Zero Hash documents the ±5 minute replay window but NOT whether the timestamp
 * is in seconds or milliseconds. Assuming the wrong unit rejects every delivery,
 * so detect it from the magnitude: a ~10-digit value is seconds, a ~13-digit
 * value is already milliseconds. Only the staleness check needs this - the HMAC
 * always covers the timestamp string exactly as received.
 */
function toMillis(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return NaN;
  return Math.abs(value) < 1e11 ? value * 1000 : value;
}

/**
 * Verify a Zero Hash webhook signature.
 *
 * Zero Hash has no webhook SDK, so we verify manually. It signs the RAW request
 * body with HMAC-SHA256 and sends a HEX digest. Two schemes exist:
 *
 *  - Recommended: `x-zh-hook-signature` = to_hex(hmac_sha256(payload + timestamp, secret))
 *    with `x-zh-hook-timestamp`. Reject if the timestamp is outside ±5 minutes of now.
 *  - Legacy: `x-zh-hook-signature-256` = to_hex(hmac_sha256(payload, secret)), no timestamp.
 *
 * `payload + timestamp` is a plain concatenation with NO delimiter.
 */
function verifyZeroHash(rawBody, headers, secret) {
  const signature = headers['x-zh-hook-signature'];
  const timestamp = headers['x-zh-hook-timestamp'];

  if (signature && timestamp) {
    // Replay guard: accept a seconds or milliseconds timestamp (unit undocumented).
    const timestampMs = toMillis(timestamp);
    if (!Number.isFinite(timestampMs)) return false;
    if (Math.abs(Date.now() - timestampMs) > TOLERANCE_MS) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody + timestamp, 'utf8')
      .digest('hex');
    return timingSafeEqual(expected, signature);
  }

  // Fall back to the legacy scheme (payload only, no timestamp).
  // NOTE: the legacy scheme has NO replay window - a captured request stays
  // valid forever. If your Zero Hash rep has put you on the new
  // x-zh-hook-signature + x-zh-hook-timestamp scheme, DELETE this branch.
  const legacy = headers['x-zh-hook-signature-256'];
  if (legacy) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');
    return timingSafeEqual(expected, legacy);
  }

  return false;
}

function timingSafeEqual(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false; // length mismatch => invalid
  }
}

// Zero Hash webhook endpoint.
// Must use the RAW body for signature verification - do not parse JSON first.
app.post(
  '/webhooks/zerohash',
  express.raw({ type: '*/*' }),
  (req, res) => {
    // req.body is a Buffer here (express.raw). Get the raw string.
    const rawBody = req.body.toString('utf8');

    if (!req.headers['x-zh-hook-signature'] && !req.headers['x-zh-hook-signature-256']) {
      return res.status(400).send('Missing Zero Hash signature header');
    }

    if (!verifyZeroHash(rawBody, req.headers, webhookSecret)) {
      return res.status(400).send('Invalid signature');
    }

    // Signature verified - safe to parse. The event type is in a header.
    // Zero Hash's docs are inconsistent about the exact payload-type strings
    // (underscore vs dot forms) - confirm them with your Zero Hash rep and let
    // the default branch log anything unexpected.
    const payloadType = req.headers['x-zh-hook-payload-type'];
    // Unconfirmed header - may be absent, so read it defensively and fall back
    // to an id in the body or a hash of the payload for idempotency.
    const notificationId = req.headers['x-zh-hook-notification-id'];
    const data = JSON.parse(rawBody);

    // TODO: use notificationId (when present) to deduplicate (idempotency).
    switch (payloadType) {
      case 'trade_status_changed':
        console.log(`Trade ${data.trade_id} status: ${data.status}`);
        // TODO: update order/settlement state (accepted | active | terminated).
        break;

      case 'payment_status_changed':
        console.log(`Payment ${data.payment_id} status: ${data.status}`);
        // TODO: update payment state. The payload shape is not documented -
        // log a real delivery before branching on specific status values.
        break;

      // Balance event name is unconfirmed - Zero Hash's docs show a dot form,
      // so accept the underscore spelling too.
      case 'account_balance.changed':
      case 'account_balance_changed':
        console.log(
          `Balance changed: ${data.asset} ${data.account_type} = ${data.balance}`
        );
        // TODO: reconcile available/collateral balances.
        break;

      default:
        console.log(`Unhandled payload type: ${payloadType}`);
    }

    // Return 200 quickly to acknowledge receipt.
    res.json({ received: true });
  }
);

// Health check endpoint.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing.
module.exports = app;

// Start the server only when run directly (not when imported for testing).
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/zerohash`);
  });
}
