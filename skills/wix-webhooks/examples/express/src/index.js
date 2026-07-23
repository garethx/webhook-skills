// Generated with: wix-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const { AppStrategy, createClient } = require('@wix/sdk');
const { orders } = require('@wix/ecom');

const app = express();

// The public key is stored on one line in .env with `\n` escapes; restore the
// real newlines. (@wix/sdk also accepts a base64-encoded PEM.)
const PUBLIC_KEY = (process.env.WIX_PUBLIC_KEY || '').replace(/\\n/g, '\n');
const APP_ID = process.env.WIX_APP_ID;

// The Wix client verifies the webhook JWT (RS256) with your app's public key
// and dispatches decoded events to the handlers you register below.
const client = createClient({
  auth: AppStrategy({ appId: APP_ID, publicKey: PUBLIC_KEY }),
  modules: { orders },
});

// In-memory dedupe store. Wix retries deliveries, so the same event can arrive
// more than once and out of order. Use a durable store (Redis, DB) in production.
const processedEvents = new Set();

function handleOnce(event, handler) {
  const eventId = event.metadata._id; // unique event ID
  if (eventId && processedEvents.has(eventId)) {
    console.log(`Duplicate event ${eventId} ignored`);
    return;
  }
  if (eventId) processedEvents.add(eventId);
  handler();
}

// Register a handler per event type. `event.metadata` always has instanceId
// (the site), _id (the event ID), and entityId (the affected entity).
client.orders.onOrderCreated((event) =>
  handleOnce(event, () => {
    console.log('Order created:', event.metadata.entityId, 'on site', event.metadata.instanceId);
    // TODO: fulfil order, notify, sync to your system
  })
);

client.orders.onOrderApproved((event) =>
  handleOnce(event, () => {
    console.log('Order approved:', event.metadata.entityId);
    // TODO: trigger fulfilment, grant access
  })
);

client.orders.onOrderUpdated((event) =>
  handleOnce(event, () => {
    console.log('Order updated:', event.metadata.entityId);
    // TODO: sync order changes
  })
);

client.orders.onOrderCanceled((event) =>
  handleOnce(event, () => {
    console.log('Order canceled:', event.metadata.entityId);
    // TODO: reverse fulfilment, revoke access
  })
);

// Wix sends the JWT as the raw request body. Parse it as text (NOT JSON) so the
// exact bytes reach the verifier — re-serialized JSON breaks the signature.
app.post('/webhooks/wix', express.text({ type: '*/*' }), async (req, res) => {
  if (!req.body) {
    return res.status(400).send('Missing webhook body');
  }

  try {
    // process() verifies the signature, decodes the event, and runs any
    // matching handlers. It throws on an invalid signature or expired token.
    const { eventType } = await client.webhooks.process(req.body);
    console.log(`Processed ${eventType}`);
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).send('Invalid webhook signature or payload');
  }

  // Acknowledge fast (within ~1250 ms) so Wix doesn't retry.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, client, processedEvents };

// Start the server only when run directly (not when imported for tests).
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/wix`);
  });
}
