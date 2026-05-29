// Generated with: standard-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Standard Webhooks endpoint
// IMPORTANT: Use express.raw() — signature verification needs the unparsed body
app.post(
  '/webhooks/standard',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const id = req.headers['webhook-id'];
    const timestamp = req.headers['webhook-timestamp'];
    const signature = req.headers['webhook-signature'];
    if (!id || !timestamp || !signature) {
      return res
        .status(400)
        .json({ error: 'Missing required webhook headers (webhook-id, webhook-timestamp, webhook-signature)' });
    }

    try {
      const wh = new Webhook(secret);
      const event = wh.verify(req.body, {
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      });
      if (!event) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      console.log(`Received Standard Webhook: ${event.type}`);

      switch (event.type) {
        case 'contact.created':
          console.log('Contact created:', { id: event.data?.id, email: event.data?.email });
          break;
        case 'contact.updated':
          console.log('Contact updated:', { id: event.data?.id });
          break;
        case 'contact.deleted':
          console.log('Contact deleted:', { id: event.data?.id });
          break;
        case 'message.sent':
          console.log('Message sent:', { id: event.data?.id });
          break;
        case 'message.failed':
          console.log('Message failed:', { id: event.data?.id, error: event.data?.error });
          break;
        default:
          console.log('Unhandled event type:', event.type);
      }

      res.status(200).json({ success: true, type: event.type });
    } catch (err) {
      const raw = err && (err.message || String(err));
      console.error('Webhook verification failed:', raw);
      let message = 'Webhook verification failed';
      if (raw === 'Message timestamp too old') message = 'Timestamp too old';
      else if (raw === 'Message timestamp too new') message = 'Timestamp too new';
      else if (raw === 'No matching signature found') message = 'Invalid signature';
      else if (raw) message = raw;
      res.status(400).json({ error: message });
    }
  }
);

const server = app.listen(PORT, () => {
  console.log(`Standard Webhooks server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/standard`);
});

module.exports = { app, server };
