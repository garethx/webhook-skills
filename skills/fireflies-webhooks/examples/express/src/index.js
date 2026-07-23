// Generated with: fireflies-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Fireflies webhook signature.
 *
 * Fireflies signs the raw request body with HMAC-SHA256 keyed on your webhook
 * secret and sends the digest in the `x-hub-signature` header as a bare hex
 * string (no `sha256=` prefix). Compare against the header value directly.
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - x-hub-signature header value
 * @param {string} secret - Fireflies webhook signing secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyFirefliesWebhook(rawBody, signatureHeader, secret) {
  // Fail closed: no header or no configured secret means we cannot verify
  if (!signatureHeader || !secret) {
    return false;
  }

  // Compute expected signature over the raw body (hex-encoded, no prefix)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    // Different lengths / non-hex header means invalid
    return false;
  }
}

// Fireflies webhook endpoint - must use raw body for signature verification
app.post('/webhooks/fireflies',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-hub-signature'];
    const secret = process.env.FIREFLIES_WEBHOOK_SECRET;

    // Fail closed when the secret is missing rather than throwing an opaque 500
    if (!secret) {
      console.error('FIREFLIES_WEBHOOK_SECRET is not set - cannot verify webhooks');
      return res.status(401).send('Invalid signature');
    }

    // Verify webhook signature
    if (!verifyFirefliesWebhook(req.body, signature, secret)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString());
    const { meetingId, eventType, clientReferenceId } = payload;

    console.log(`Received "${eventType}" event for meeting ${meetingId}`);

    // Handle the event based on its type (Fireflies puts the type in the body)
    switch (eventType) {
      case 'Transcription completed':
        console.log(`Transcript ready for meeting ${meetingId}` +
          (clientReferenceId ? ` (ref: ${clientReferenceId})` : ''));
        // TODO: Fetch the transcript from the Fireflies GraphQL API using
        // meetingId, then sync notes, post to Slack, update your CRM, etc.
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyFirefliesWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fireflies`);
  });
}
