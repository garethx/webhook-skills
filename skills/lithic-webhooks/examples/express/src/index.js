// Generated with: lithic-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const Lithic = require('lithic');

const app = express();

// Lithic webhooks implement the Standard Webhooks spec (powered by Svix).
// The official SDK verifies the signature AND parses the event in one call:
//   lithic.webhooks.unwrap(rawBody, headers, secret)
// It validates the `webhook-signature` HMAC-SHA256 over
// `{webhook-id}.{webhook-timestamp}.{rawBody}` and enforces a ~5-minute
// timestamp tolerance, throwing if verification fails.
//
// The API key is only needed to call the Lithic API; webhook verification uses
// the signing secret. A placeholder keeps the client constructable if you only
// receive webhooks.
const lithic = new Lithic({
  apiKey: process.env.LITHIC_API_KEY || 'placeholder-not-used-for-webhooks',
  webhookSecret: process.env.LITHIC_WEBHOOK_SECRET,
});

// CRITICAL: use express.raw() so the SDK verifies the signature against the
// exact bytes Lithic signed. Parsing JSON first would break verification.
app.post(
  '/webhooks/lithic',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : req.body;

    let event;
    try {
      // Verifies signature + timestamp, then returns the parsed event.
      event = lithic.webhooks.unwrap(
        rawBody,
        req.headers,
        process.env.LITHIC_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Lithic webhook verification failed:', err.message);
      return res.status(400).send('Invalid signature');
    }

    // Lithic event objects carry an `event_type` (resource.action) field.
    switch (event.event_type) {
      case 'card.created':
        console.log('Card created:', event.payload?.token ?? event.token);
        // TODO: Provision the new card in your system
        break;

      case 'card.updated':
        console.log('Card updated:', event.payload?.token ?? event.token);
        // TODO: Sync card state (e.g. PAUSED/CLOSED)
        break;

      case 'card_transaction.updated':
        console.log('Card transaction updated:', event.payload?.token);
        // TODO: Reconcile authorization / clearing state
        break;

      case 'payment_transaction.created':
        console.log('Payment transaction created:', event.payload?.token);
        // TODO: Record incoming ACH / wire payment
        break;

      case 'payment_transaction.updated':
        console.log('Payment transaction updated:', event.payload?.token);
        // TODO: Update payment status (settled, returned)
        break;

      case 'dispute.updated':
        console.log('Dispute updated:', event.payload?.token);
        // TODO: Progress the dispute workflow
        break;

      case 'balance.updated':
        console.log('Balance updated for account:', event.payload?.financial_account_token);
        // TODO: Refresh cached balances
        break;

      case 'three_ds_authentication.created':
        console.log('3DS authentication created:', event.payload?.token);
        // TODO: Handle challenge / decisioning
        break;

      default:
        console.log('Unhandled event type:', event.event_type);
    }

    // Acknowledge quickly so Lithic does not retry.
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

// Start the server only when run directly (not when imported by tests).
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/lithic`);
  });
}
