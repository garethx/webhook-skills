// Generated with: treezor-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Re-serialize an object_payload into Treezor's canonical form, matching PHP's
 * default json_encode: compact separators, forward slashes escaped, and all
 * non-ASCII characters escaped to lowercase \uXXXX.
 * @param {*} objectPayload - The parsed object_payload from the webhook body
 * @returns {string}
 */
function canonicalize(objectPayload) {
  return JSON.stringify(objectPayload)
    .replace(/\//g, '\\/')
    .replace(/[\u0080-\uffff]/g, (ch) =>
      '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}

/**
 * Verify a Treezor webhook. The signature is a BODY FIELD
 * (object_payload_signature), not an HTTP header, and covers the canonicalized
 * object_payload — not the raw request body.
 * @param {*} objectPayload - Parsed object_payload from the webhook body
 * @param {string} receivedSignature - The object_payload_signature field
 * @param {string} secret - Your Treezor webhook_secret
 * @returns {boolean}
 */
function verifyTreezorWebhook(objectPayload, receivedSignature, secret) {
  if (!receivedSignature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(canonicalize(objectPayload), 'utf8')
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature),
      Buffer.from(expected)
    );
  } catch {
    return false; // different lengths = invalid
  }
}

// Treezor sends webhooks as text/plain, so capture the raw body for any content
// type and parse the JSON ourselves.
app.post('/webhooks/treezor',
  express.raw({ type: '*/*' }),
  (req, res) => {
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Verify the signature before trusting anything in the body.
    if (!verifyTreezorWebhook(
      event.object_payload,
      event.object_payload_signature,
      process.env.TREEZOR_WEBHOOK_SECRET
    )) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Deliveries can be duplicated and arrive out of order.
    // Dedupe on webhook_id and compare webhook_created_at in real handlers.
    //
    // SECURITY: only object_payload is covered by object_payload_signature. The
    // envelope fields below (webhook, webhook_id, object, object_id) are NOT
    // signed, so treat them as untrusted routing/logging metadata. Derive any
    // business state from the verified event.object_payload instead.
    const eventName = event.webhook;
    console.log(`Received ${eventName} (webhook_id=${event.webhook_id})`);

    switch (eventName) {
      case 'payin.create':
        console.log('Pay-in created:', event.object_id);
        // TODO: credit wallet, notify user
        break;

      case 'payin.update':
        console.log('Pay-in updated:', event.object_id);
        // TODO: track settlement/refund state
        break;

      case 'payout.create':
        console.log('Payout created:', event.object_id);
        // TODO: confirm withdrawal initiated
        break;

      case 'payout.update':
        console.log('Payout updated:', event.object_id);
        // TODO: track execution/rejection
        break;

      case 'transfer.create':
        console.log('Transfer created:', event.object_id);
        // TODO: update balances
        break;

      case 'transaction.create':
        console.log('Transaction created:', event.object_id);
        // TODO: reconciliation, statements
        break;

      case 'cardtransaction.create':
        console.log('Card transaction:', event.object_id);
        // TODO: real-time spend notification
        break;

      case 'card.create':
        console.log('Card issued:', event.object_id);
        // TODO: activate card in UI
        break;

      case 'card.update':
        console.log('Card updated:', event.object_id);
        // TODO: reflect lock/unlock, limit changes
        break;

      case 'wallet.create':
        console.log('Wallet created:', event.object_id);
        // TODO: provision account for user
        break;

      case 'user.create':
        console.log('User created:', event.object_id);
        // TODO: onboarding flow
        break;

      case 'user.update':
        console.log('User updated:', event.object_id);
        // TODO: sync profile changes
        break;

      case 'user.kycreview':
        console.log('KYC review:', event.object_id);
        // TODO: gate features on KYC level
        break;

      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    // Acknowledge receipt. Return a 5xx instead to trigger Treezor's retries.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, canonicalize, verifyTreezorWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/treezor`);
  });
}
