// Generated with: discord-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const { verifyKey } = require('discord-interactions');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Discord webhook endpoint
// IMPORTANT: Use express.raw() — Ed25519 verification needs the exact raw body bytes.
app.post('/webhooks/discord',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const publicKey = process.env.DISCORD_PUBLIC_KEY;
    if (!publicKey) {
      console.error('DISCORD_PUBLIC_KEY is not configured');
      return res.status(500).send('Server configuration error');
    }

    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    if (!signature || !timestamp) {
      return res.status(401).send('Missing signature headers');
    }

    let isValid;
    try {
      isValid = await verifyKey(req.body, signature, timestamp, publicKey);
    } catch {
      isValid = false;
    }
    if (!isValid) {
      return res.status(401).send('Invalid request signature');
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON payload');
    }

    // type 0 = PING (endpoint validation). Reply 204 with empty body.
    if (payload.type === 0) {
      console.log('Received Discord PING');
      return res.status(204).send();
    }

    // type 1 = webhook event
    if (payload.type === 1 && payload.event) {
      const event = payload.event;
      console.log(`Received Discord event: ${event.type}`);

      switch (event.type) {
        case 'APPLICATION_AUTHORIZED':
          console.log('App authorized:', {
            userId: event.data?.user?.id,
            scopes: event.data?.scopes
          });
          break;
        case 'APPLICATION_DEAUTHORIZED':
          console.log('App deauthorized:', {
            userId: event.data?.user?.id
          });
          break;
        case 'ENTITLEMENT_CREATE':
          console.log('Entitlement created:', {
            entitlementId: event.data?.id,
            userId: event.data?.user_id,
            skuId: event.data?.sku_id
          });
          break;
        case 'ENTITLEMENT_UPDATE':
          console.log('Entitlement updated:', { entitlementId: event.data?.id });
          break;
        case 'ENTITLEMENT_DELETE':
          console.log('Entitlement deleted:', { entitlementId: event.data?.id });
          break;
        case 'QUEST_USER_ENROLLMENT':
          console.log('Quest enrollment:', {
            userId: event.data?.user_id,
            questId: event.data?.quest_id
          });
          break;
        case 'LOBBY_MESSAGE_CREATE':
          console.log('Lobby message:', {
            lobbyId: event.data?.lobby_id,
            content: event.data?.content
          });
          break;
        case 'GAME_DIRECT_MESSAGE_CREATE':
          console.log('Game DM:', {
            channelId: event.data?.channel_id,
            content: event.data?.content
          });
          break;
        default:
          console.log('Unhandled event type:', event.type);
      }
    }

    // Acknowledge with 204 (no body). Any 2XX within 3s is accepted by Discord.
    return res.status(204).send();
  }
);

const server = app.listen(PORT, () => {
  console.log(`Discord webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/discord`);
});

module.exports = { app, server };
