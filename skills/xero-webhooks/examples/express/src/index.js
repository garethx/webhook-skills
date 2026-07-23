// Generated with: xero-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Xero webhook signature.
 *
 * Xero computes HMAC-SHA256 over the RAW request body using the app's webhook
 * signing key, base64-encodes it, and sends it in the `x-xero-signature` header.
 * The official SDKs do not provide a webhook helper, so verify manually.
 *
 * @param {Buffer} rawBody - Raw request body (exact bytes received)
 * @param {string} signatureHeader - `x-xero-signature` header value
 * @param {string} signingKey - Xero webhook signing key (XERO_WEBHOOK_KEY)
 * @returns {boolean} Whether the signature is valid
 */
function verifyXeroSignature(rawBody, signatureHeader, signingKey) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    // Buffers of different lengths => invalid
    return false;
  }
}

/**
 * Handle a single Xero event. Payloads are thin: fetch the resource from
 * `event.resourceUrl` (authenticated with an OAuth2 token + `Xero-tenant-id`)
 * to get the full record. Dedupe on resourceId + eventDateUtc for idempotency.
 */
function handleEvent(event) {
  const key = `${event.eventCategory}/${event.eventType}`;

  switch (key) {
    case 'CONTACT/CREATE':
      console.log('New contact:', event.resourceId);
      // TODO: fetch event.resourceUrl, sync new contact to your CRM
      break;

    case 'CONTACT/UPDATE':
      console.log('Contact updated:', event.resourceId);
      // TODO: fetch event.resourceUrl, update local contact record
      break;

    case 'INVOICE/CREATE':
      console.log('New invoice:', event.resourceId);
      // TODO: fetch event.resourceUrl, record receivable/payable
      break;

    case 'INVOICE/UPDATE':
      console.log('Invoice updated:', event.resourceId);
      // TODO: fetch event.resourceUrl, reconcile payment/status change
      break;

    case 'CREDITNOTE/CREATE':
      console.log('New credit note:', event.resourceId);
      // TODO: fetch event.resourceUrl, track refund/adjustment
      break;

    case 'CREDITNOTE/UPDATE':
      console.log('Credit note updated:', event.resourceId);
      // TODO: fetch event.resourceUrl, update refund/adjustment
      break;

    case 'SUBSCRIPTION/CREATE':
      console.log('New subscription:', event.resourceId);
      // TODO: provision access for new app-store subscription
      break;

    case 'SUBSCRIPTION/UPDATE':
      console.log('Subscription updated:', event.resourceId);
      // TODO: handle upgrade/cancellation/renewal
      break;

    default:
      console.log(`Unhandled event: ${key} (${event.resourceId})`);
  }
}

// Xero webhook endpoint - must use the RAW body for signature verification.
app.post('/webhooks/xero',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-xero-signature'];

    // Verify first. Xero's Intent to Receive (ITR) requires:
    //   200 when the signature is valid, 401 when it is not.
    // Return 401 (NOT 400) for a bad signature or ITR will fail and the
    // webhook will stay inactive.
    if (!verifyXeroSignature(req.body, signature, process.env.XERO_WEBHOOK_KEY)) {
      console.error('Xero signature verification failed');
      return res.status(401).send('Unauthorized');
    }

    // Acknowledge immediately (ITR probes carry no real events and are answered
    // by the 200 above). Parse and dispatch real events after verification.
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      // Valid signature but unparseable body (e.g. an empty ITR probe): still a 200.
      return res.status(200).send('OK');
    }

    if (Array.isArray(payload.events)) {
      for (const event of payload.events) {
        handleEvent(event);
      }
    }

    // Respond fast; do heavy work (resource fetches) asynchronously.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyXeroSignature, handleEvent };

// Start server only when run directly (not when imported for tests)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/xero`);
  });
}
