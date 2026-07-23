// Generated with: typeform-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Typeform webhook signature.
 *
 * Typeform signs the raw request body with HMAC-SHA256 keyed on your webhook
 * secret, base64-encodes it, and sends it in the `Typeform-Signature` header
 * prefixed with `sha256=`.
 *
 * @param {Buffer} rawBody - Raw request body (Buffer, not parsed JSON)
 * @param {string} signatureHeader - Typeform-Signature header value
 * @param {string} secret - Your webhook signing secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyTypeformSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const expected = `sha256=${hash}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

// Typeform webhook endpoint - must use raw body for signature verification
app.post(
  '/webhooks/typeform',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['typeform-signature'];

    // Verify webhook signature against the raw body
    if (!verifyTypeformSignature(req.body, signature, process.env.TYPEFORM_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification succeeds
    const event = JSON.parse(req.body.toString('utf8'));
    const { event_id, event_type, form_response } = event;

    console.log(`Received ${event_type} (event_id: ${event_id})`);

    // Handle the event based on its type
    switch (event_type) {
      case 'form_response':
        console.log('Form submitted:', form_response.form_id, 'token:', form_response.token);
        // TODO: Process the submission — sync to CRM, notify, fulfill, etc.
        break;

      case 'form_response_partial':
        console.log('Partial submission:', form_response.form_id, 'token:', form_response.token);
        // TODO: Follow up on abandoned forms, track drop-off, etc.
        break;

      default:
        console.log(`Unhandled event type: ${event_type}`);
    }

    // Acknowledge receipt quickly; do heavy work asynchronously
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyTypeformSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/typeform`);
  });
}
