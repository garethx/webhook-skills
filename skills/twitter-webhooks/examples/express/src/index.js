// Generated with: twitter-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Build an X/Twitter signature value.
 *
 * `sha256=` + base64(HMAC-SHA256(consumerSecret, message)). This same primitive
 * produces the CRC `response_token` (message = crc_token) and the expected
 * `x-twitter-webhooks-signature` for POST events (message = raw body).
 *
 * @param {string|Buffer} message - crc_token string, or raw request body
 * @param {string} consumerSecret - App consumer secret (API Secret Key)
 * @returns {string}
 */
function buildSignature(message, consumerSecret) {
  return 'sha256=' + crypto
    .createHmac('sha256', consumerSecret)
    .update(message)
    .digest('base64');
}

/**
 * Verify the x-twitter-webhooks-signature header against the raw body.
 *
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string} signatureHeader - x-twitter-webhooks-signature value
 * @param {string} consumerSecret - App consumer secret (API Secret Key)
 * @returns {boolean}
 */
function verifyTwitterSignature(rawBody, signatureHeader, consumerSecret) {
  if (!signatureHeader || !consumerSecret) return false;
  const expected = buildSignature(rawBody, consumerSecret);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // different lengths = invalid
  }
}

// CRC (Challenge-Response Check): X sends GET ?crc_token=... at registration,
// roughly hourly, and on demand. Reply with the response_token or X marks the
// webhook invalid and stops delivering events.
app.get('/webhooks/twitter', (req, res) => {
  const crcToken = req.query.crc_token;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;

  if (!crcToken) {
    return res.status(400).send('Missing crc_token');
  }
  if (!consumerSecret) {
    return res.status(500).send('Server misconfigured: TWITTER_CONSUMER_SECRET not set');
  }

  return res.status(200).json({
    response_token: buildSignature(String(crcToken), consumerSecret),
  });
});

// Event deliveries — must use the raw body for signature verification
app.post('/webhooks/twitter',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-twitter-webhooks-signature'];
    const rawBody = req.body; // Buffer from express.raw()

    if (!verifyTwitterSignature(rawBody, signature, process.env.TWITTER_CONSUMER_SECRET)) {
      console.error('Twitter signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The same endpoint receives every event type — dispatch on the event key
    // present in the payload. `for_user_id` names the subscribed user.
    const forUser = payload.for_user_id;

    if (payload.tweet_create_events) {
      console.log(`tweet_create_events for ${forUser}: ${payload.tweet_create_events.length} tweet(s)`);
      // TODO: Process new Posts, mentions, replies, quotes
    } else if (payload.tweet_delete_events) {
      console.log(`tweet_delete_events for ${forUser}`);
      // TODO: Handle deletion compliance notices
    } else if (payload.favorite_events) {
      console.log(`favorite_events for ${forUser}: ${payload.favorite_events.length} like(s)`);
      // TODO: Handle likes
    } else if (payload.follow_events) {
      const e = payload.follow_events[0] || {};
      console.log(`follow_events for ${forUser}: ${e.type}`); // follow | unfollow
      // TODO: Handle follow / unfollow
    } else if (payload.block_events) {
      console.log(`block_events for ${forUser}: ${payload.block_events[0]?.type}`); // block | unblock
      // TODO: Handle block / unblock
    } else if (payload.mute_events) {
      console.log(`mute_events for ${forUser}: ${payload.mute_events[0]?.type}`); // mute | unmute
      // TODO: Handle mute / unmute
    } else if (payload.direct_message_events) {
      console.log(`direct_message_events for ${forUser}: ${payload.direct_message_events.length} message(s)`);
      // TODO: Handle direct messages
    } else if (payload.direct_message_indicate_typing_events) {
      console.log(`direct_message_indicate_typing_events for ${forUser}`);
    } else if (payload.direct_message_mark_read_events) {
      console.log(`direct_message_mark_read_events for ${forUser}`);
    } else if (payload.user_event) {
      console.log('user_event: authorization revoked');
      // TODO: Clean up the revoked user's subscription/state
    } else {
      console.log('Unhandled event payload keys:', Object.keys(payload).join(', '));
    }

    // Acknowledge within 10 seconds. Delivery is at-most-once (no documented
    // retries), so process idempotently.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, buildSignature, verifyTwitterSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/twitter`);
  });
}
