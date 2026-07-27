// Generated with: tiktok-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a TikTok for Developers webhook.
 *
 * TikTok has no webhook SDK. The `TikTok-Signature` header looks like:
 *
 *   t=1633174587,s=<hex>
 *
 * signature = HMAC-SHA256(client_secret, "<t>.<raw_body>"), hex-encoded.
 * Verify against the RAW body and reject stale timestamps (replay protection).
 *
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string} header - TikTok-Signature header value
 * @param {string} clientSecret - Your app's client secret
 * @param {number} toleranceSec - Max age of the timestamp, in seconds
 * @returns {boolean} - Whether the signature is valid and fresh
 */
function verifyTikTokWebhook(rawBody, header, clientSecret, toleranceSec = 300) {
  // No secret configured means we cannot verify anything — fail closed rather
  // than throwing an opaque 500 from createHmac(…, undefined).
  if (!header || !clientSecret) {
    return false;
  }

  // Header format: "t=<ts>,s=<hex>"
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('='))
  );
  const { t, s } = parts;
  if (!t || !s) {
    return false;
  }

  // Reject stale timestamps. TikTok documents no explicit tolerance window;
  // 5 minutes is a sane default. Pair with idempotency to dedupe retries.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > toleranceSec) {
    return false;
  }

  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(`${t}.${raw}`, 'utf8')
    .digest('hex');

  // Timing-safe compare; catch length mismatches instead of throwing.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(s, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// TikTok webhook endpoint — must use the raw body for signature verification.
app.post(
  '/webhooks/tiktok',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const signature = req.headers['tiktok-signature'];

    // Verify before parsing.
    if (!verifyTikTokWebhook(req.body, signature, process.env.TIKTOK_CLIENT_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Safe to parse now that the signature checks out.
    const payload = JSON.parse(req.body.toString('utf8'));
    const { event, user_openid: userOpenId, create_time: createTime } = payload;

    // `content` is a serialized JSON string — parse it separately.
    let content = {};
    try {
      content = payload.content ? JSON.parse(payload.content) : {};
    } catch {
      content = {};
    }

    console.log(`Received ${event} for ${userOpenId ?? '(no openid)'} at ${createTime}`);

    // Delivery is at-least-once — dedupe on a stable key before doing real work.
    switch (event) {
      case 'authorization.removed':
        // content.reason: 0 unknown, 1 user disconnect, 2 account deleted,
        // 3 age change, 4 account banned, 5 developer revoked.
        console.log(`Authorization removed (reason ${content.reason})`);
        // TODO: purge stored tokens for userOpenId, stop syncing.
        break;

      case 'video.upload.failed':
        console.log(`Video upload failed: ${content.share_id}`);
        // TODO: surface the failure / retry.
        break;

      case 'video.publish.completed':
        console.log(`Video published: ${content.share_id}`);
        // TODO: mark the post live, record the published video.
        break;

      case 'portability.download.ready':
        console.log(`Data export ready: request ${content.request_id}`);
        // TODO: fetch the export, notify the requesting user.
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Acknowledge quickly (within TikTok's window) so it does not retry.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyTikTokWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tiktok`);
  });
}
