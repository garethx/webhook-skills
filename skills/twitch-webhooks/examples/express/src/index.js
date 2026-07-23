// Generated with: twitch-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Twitch EventSub message types (Twitch-Eventsub-Message-Type header)
const MESSAGE_TYPE_VERIFICATION = 'webhook_callback_verification';
const MESSAGE_TYPE_NOTIFICATION = 'notification';
const MESSAGE_TYPE_REVOCATION = 'revocation';

// Reject messages whose timestamp is older than this (replay protection)
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Verify a Twitch EventSub webhook signature.
 *
 * Twitch signs an HMAC-SHA256 over the concatenation of the message id, the
 * message timestamp, and the RAW request body (in that order), and sends it in
 * the Twitch-Eventsub-Message-Signature header as "sha256=<hex>".
 *
 * @param {string} messageId - Twitch-Eventsub-Message-Id header
 * @param {string} timestamp - Twitch-Eventsub-Message-Timestamp header
 * @param {Buffer|string} rawBody - Raw (unparsed) request body
 * @param {string} signatureHeader - Twitch-Eventsub-Message-Signature header
 * @param {string} secret - The subscription secret
 * @returns {boolean}
 */
function verifyTwitchSignature(messageId, timestamp, rawBody, signatureHeader, secret) {
  if (!messageId || !timestamp || !signatureHeader) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(messageId);
  hmac.update(timestamp);
  hmac.update(rawBody);
  const expected = 'sha256=' + hmac.digest('hex');

  // Timing-safe comparison; throws on length mismatch, so guard it.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Twitch webhook endpoint - must use raw body for signature verification
app.post('/webhooks/twitch',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const messageId = req.headers['twitch-eventsub-message-id'];
    const timestamp = req.headers['twitch-eventsub-message-timestamp'];
    const signature = req.headers['twitch-eventsub-message-signature'];
    const messageType = req.headers['twitch-eventsub-message-type'];

    // 1. Verify the signature (applies to ALL message types)
    if (!verifyTwitchSignature(messageId, timestamp, req.body, signature, process.env.TWITCH_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(403).send('Invalid signature');
    }

    // 2. Reject stale messages (replay protection)
    if (Math.abs(Date.now() - new Date(timestamp).getTime()) > MAX_AGE_MS) {
      console.error('Webhook timestamp too old');
      return res.status(403).send('Stale message');
    }

    // Parse the payload only AFTER the signature is verified
    const payload = JSON.parse(req.body.toString());

    // 3. Respond to the one-time verification challenge
    if (messageType === MESSAGE_TYPE_VERIFICATION) {
      console.log('Responding to webhook_callback_verification challenge');
      // Must return the raw challenge string as text/plain (not JSON-wrapped)
      return res.status(200).type('text/plain').send(payload.challenge);
    }

    // 4. Handle subscription revocation
    if (messageType === MESSAGE_TYPE_REVOCATION) {
      console.warn(
        `Subscription ${payload.subscription.type} revoked:`,
        payload.subscription.status
      );
      return res.status(204).end();
    }

    // 5. Handle notifications
    if (messageType === MESSAGE_TYPE_NOTIFICATION) {
      handleEvent(payload.subscription.type, payload.event);
      return res.status(204).end();
    }

    console.log(`Unknown message type: ${messageType}`);
    return res.status(204).end();
  }
);

/**
 * Dispatch a Twitch EventSub notification by subscription type.
 */
function handleEvent(subscriptionType, event) {
  console.log(`Received ${subscriptionType} notification`);

  switch (subscriptionType) {
    case 'stream.online':
      console.log(`${event.broadcaster_user_name} went live (${event.type})`);
      // TODO: post "now live" alert, start recording, etc.
      break;

    case 'stream.offline':
      console.log(`${event.broadcaster_user_name} went offline`);
      // TODO: post end-of-stream summary, stop recording, etc.
      break;

    case 'channel.follow':
      console.log(`${event.user_name} followed ${event.broadcaster_user_name}`);
      // TODO: follower alert, welcome message, etc.
      break;

    case 'channel.update':
      console.log(`${event.broadcaster_user_name} updated: ${event.title} (${event.category_name})`);
      // TODO: refresh embeds, log category change, etc.
      break;

    case 'channel.subscribe':
      console.log(`${event.user_name} subscribed (tier ${event.tier})`);
      // TODO: sub alert, loyalty rewards, etc.
      break;

    case 'channel.subscription.gift':
      console.log(`${event.user_name} gifted ${event.total} sub(s)`);
      // TODO: gift-sub alert, leaderboard, etc.
      break;

    case 'channel.cheer':
      console.log(`${event.user_name} cheered ${event.bits} bits`);
      // TODO: bits alert, goal tracking, etc.
      break;

    case 'channel.raid':
      console.log(`${event.from_broadcaster_user_name} raided with ${event.viewers} viewers`);
      // TODO: raid alert, shoutout, etc.
      break;

    case 'channel.ban':
      console.log(`${event.user_name} was banned by ${event.moderator_user_name}`);
      // TODO: moderation log, etc.
      break;

    case 'channel.channel_points_custom_reward_redemption.add':
      console.log(`${event.user_name} redeemed "${event.reward.title}"`);
      // TODO: fulfill reward, queue actions, etc.
      break;

    default:
      console.log(`Unhandled subscription type: ${subscriptionType}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyTwitchSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/twitch`);
  });
}
