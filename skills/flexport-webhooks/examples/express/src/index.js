// Generated with: flexport-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Flexport webhook signature.
 *
 * Flexport signs the raw request body with HMAC-SHA256 keyed on your endpoint's
 * secret token and sends the digest in `X-Hub-Signature-256` as `sha256=<hex>`.
 * (A legacy `X-Hub-Signature` SHA-1 header is also sent but is being deprecated.)
 *
 * @param {Buffer} rawBody - Raw request body (must NOT be parsed/re-serialized)
 * @param {string} signatureHeader - X-Hub-Signature-256 header value ("sha256=<hex>")
 * @param {string} secret - Flexport endpoint secret token
 * @returns {boolean} Whether the signature is valid
 */
function verifyFlexportWebhook(rawBody, signatureHeader, secret) {
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) {
    return false;
  }

  // Compute expected signature over the raw body
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; catch length/hex mismatches
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// Flexport webhook endpoint - must use raw body for signature verification
app.post('/webhooks/flexport',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-hub-signature-256'];

    // Verify webhook signature BEFORE parsing
    if (!verifyFlexportWebhook(req.body, signature, process.env.FLEXPORT_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the Flexport Event object after verification
    const event = JSON.parse(req.body.toString());
    const type = event.type;      // milestone identifier, e.g. "/shipment#created"
    const data = event.data || {};

    console.log(`Received Flexport event ${type} (id: ${event.id})`);

    // Dispatch on the milestone identifier (/object#event format).
    // NOTE: only /shipment#created and /shipment_leg#departed are confirmed
    // against Flexport's milestone reference — the other cases below are
    // illustrative, so verify the exact identifiers for your account before
    // relying on them.
    switch (type) {
      case '/shipment#created':
        console.log('Shipment created:', data.resource?.id);
        // TODO: create internal shipment/order record
        break;

      case '/shipment#booking_confirmed':
        console.log('Booking confirmed for shipment:', data.shipment?.id);
        // TODO: notify stakeholders, update ETAs
        break;

      case '/shipment#delivered_in_full':
        console.log('Shipment delivered in full:', data.shipment?.id);
        // TODO: close out order, trigger billing
        break;

      case '/shipment_leg#departed':
        console.log('Shipment leg departed:', data.location?.name);
        // TODO: update in-transit status, notify customer
        break;

      case '/shipment_leg#arrived':
        console.log('Shipment leg arrived:', data.location?.name);
        // TODO: trigger customs / last-mile workflow
        break;

      case '/document#document_created':
        console.log('Document created:', data.resource?.id);
        // TODO: sync commercial invoice / BOL / packing list
        break;

      case '/invoice#invoice_payment_made':
        console.log('Invoice payment made:', data.resource?.id);
        // TODO: reconcile accounts payable
        break;

      case '/purchase_order#acknowledged':
        console.log('Purchase order acknowledged:', data.resource?.id);
        // TODO: advance procurement workflow
        break;

      default:
        console.log(`Unhandled event type: ${type}`);
    }

    // Return 200 promptly to acknowledge receipt (Flexport's retry behavior is
    // not documented, so do not rely on a failed delivery being re-sent)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyFlexportWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/flexport`);
  });
}
