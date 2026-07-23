// Generated with: shipbob-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ShipBob webhook endpoint
// ShipBob uses the Standard Webhooks scheme; we verify with the standardwebhooks package.
// The event topic arrives in the `x-webhook-topic` header (e.g. "order.shipped").
// IMPORTANT: Use express.raw() so we verify the exact raw body ShipBob signed.
app.post('/webhooks/shipbob',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const secret = process.env.SHIPBOB_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const webhookId = req.headers['webhook-id'];
    const webhookTimestamp = req.headers['webhook-timestamp'];
    const webhookSignature = req.headers['webhook-signature'];
    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return res.status(400).json({
        error: 'Missing required webhook headers (webhook-id, webhook-timestamp, webhook-signature)'
      });
    }

    let event;
    try {
      const wh = new Webhook(secret);
      // req.body is a Buffer (raw). standardwebhooks verifies signature + timestamp.
      event = wh.verify(req.body, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature
      });
    } catch (err) {
      console.error('Webhook verification failed:', err.message || err);
      const message = err.message === 'Message timestamp too old'
        ? 'Timestamp too old'
        : err.message === 'No matching signature found'
          ? 'Invalid signature'
          : 'Invalid signature';
      return res.status(400).json({ error: message });
    }

    // The topic identifies the event; it is a header, not a body field.
    const topic = req.headers['x-webhook-topic'] || 'unknown';
    // ShipBob retries; dedupe on webhook-id for idempotency (see webhook-handler-patterns).
    console.log(`Received ShipBob webhook: ${topic} (id=${webhookId})`);

    switch (topic) {
      case 'order.shipped':
        console.log('Order shipped:', { data: event });
        // TODO: mark order shipped / notify customer
        break;
      case 'order.shipment.delivered':
        console.log('Shipment delivered:', { data: event });
        // TODO: trigger post-delivery workflow
        break;
      case 'order.shipment.tracking.updated':
        console.log('Tracking updated:', { data: event });
        // TODO: update tracking info
        break;
      case 'order.shipment.exception':
        console.log('Shipment exception:', { data: event });
        // TODO: alert support
        break;
      case 'return.created':
        console.log('Return created:', { data: event });
        // TODO: start RMA workflow
        break;
      case 'wro.created':
        console.log('Warehouse Receiving Order created:', { data: event });
        // TODO: track inbound inventory
        break;
      case 'billing.charge.created':
        console.log('Billing charge created:', { data: event });
        // TODO: reconcile invoice
        break;
      default:
        console.log('Unhandled topic:', topic);
    }

    return res.status(200).json({ success: true, topic });
  }
);

// Start server
const server = app.listen(PORT, () => {
  console.log(`ShipBob webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/shipbob`);
});

module.exports = { app, server };
