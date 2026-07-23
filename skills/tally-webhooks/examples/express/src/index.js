// Generated with: tally-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Tally webhook signature.
 *
 * Tally signs the raw JSON body with HMAC-SHA256 keyed on the webhook's signing
 * secret, and sends the digest as base64 in the `Tally-Signature` header.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string} signatureHeader - `Tally-Signature` header value
 * @param {string} signingSecret - Per-webhook signing secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyTallyWebhook(rawBody, signatureHeader, signingSecret) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

/** Look up an answer in data.fields by its label (order-independent). */
function getAnswer(fields, label) {
  return (fields || []).find((f) => f.label === label)?.value;
}

// Tally webhook endpoint - must use the raw body for signature verification.
app.post(
  '/webhooks/tally',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['tally-signature'];
    const signingSecret = process.env.TALLY_SIGNING_SECRET;

    // Signing is optional in Tally. If a secret is configured, require and verify
    // the signature. If not, the request is unsigned — process with a warning.
    if (signingSecret) {
      if (!verifyTallyWebhook(req.body, signature, signingSecret)) {
        console.error('Tally webhook signature verification failed');
        return res.status(400).send('Invalid signature');
      }
    } else {
      console.warn(
        'TALLY_SIGNING_SECRET not set — skipping verification. Set a signing secret ' +
          'in the form Integrations tab for production endpoints.'
      );
    }

    // Parse the payload only after verification.
    const payload = JSON.parse(req.body.toString());
    const { eventId, eventType, data } = payload;

    // Handle the event based on its type. Tally currently sends only FORM_RESPONSE.
    switch (eventType) {
      case 'FORM_RESPONSE': {
        console.log(
          `FORM_RESPONSE ${eventId} for form "${data.formName}" (${data.formId})`
        );
        // Answers live in data.fields — look them up by label, not index.
        const email = getAnswer(data.fields, 'Email');
        if (email) console.log('Email answer:', email);
        // TODO: persist submission, sync to CRM, notify, etc.
        // Use eventId or data.submissionId as an idempotency key.
        break;
      }

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Acknowledge receipt within Tally's 10s timeout.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyTallyWebhook, getAnswer };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tally`);
  });
}
