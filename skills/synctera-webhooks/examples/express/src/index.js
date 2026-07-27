// Generated with: synctera-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const WEBHOOK_SECRET = process.env.SYNCTERA_WEBHOOK_SECRET;
const TOLERANCE_SECONDS = 5 * 60; // reject timestamps >5 minutes from now

/**
 * Verify a Synctera webhook.
 *
 * Synctera signs `${Request-Timestamp}.${rawBody}` with HMAC-SHA256 and
 * hex-encodes the result. Two headers are sent:
 *   - Synctera-Signature: the hex signature. During a rolling secret it holds
 *                         two "."-delimited signatures (old + new secret).
 *   - Request-Timestamp:  POSIX seconds used in the signed string.
 *
 * The secret comes from POST /v0/webhook_secrets — it is NOT your API key.
 */
function verifySyncteraSignature(rawBody, signatureHeader, timestamp, secret) {
  if (!signatureHeader || !/^\d+$/.test(String(timestamp))) return false;

  // Replay protection: Request-Timestamp must be within 5 minutes of now
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  // Recompute over the RAW body; the "." is a literal separator
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // During a rolling secret, the header holds two "."-delimited signatures
  return signatureHeader.split('.').some((candidate) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
    } catch {
      return false; // length mismatch = not a match
    }
  });
}

// Use express.raw so req.body is the exact bytes Synctera signed.
// Do NOT use express.json() on this route — parsing breaks the signature.
app.post(
  '/webhooks/synctera',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['synctera-signature'];
    const timestamp = req.headers['request-timestamp'];

    if (!signature || !timestamp) {
      return res.status(400).send('Missing signature headers');
    }

    const rawBody = req.body.toString('utf8');

    if (!verifySyncteraSignature(rawBody, signature, timestamp, WEBHOOK_SECRET)) {
      return res.status(400).send('Invalid signature');
    }

    // Signature verified — safe to parse
    const event = JSON.parse(rawBody);

    // Only ACCOUNT.UPDATED and TRANSACTIONS.POSTED.CREATED are confirmed event
    // names. Others (e.g. a CARD.* or DISPUTE.* family) follow the same
    // <resource>.[<sub-resource>.]<action> format but must be confirmed against
    // Synctera's docs / your own webhook config before you switch on them.
    switch (event.type) {
      case 'ACCOUNT.UPDATED':
        console.log('Account updated:', event.account_id || event.id);
        // TODO: sync account status/balance
        break;

      case 'TRANSACTIONS.POSTED.CREATED':
        console.log('Transaction posted:', event.transaction_id || event.id);
        // TODO: reconcile ledger / update balances
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Acknowledge within 5 seconds or Synctera retries
    res.status(200).json({ received: true });
  }
);

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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/synctera`);
  });
}
