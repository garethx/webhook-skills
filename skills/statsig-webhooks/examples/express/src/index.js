// Generated with: statsig-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Statsig Event Webhook request.
 *
 * Statsig signs `v0:{timestamp}:{raw_body}` with HMAC-SHA256 using the
 * integration's signing secret and sends the result as
 * `X-Statsig-Signature: v0=<hex>`. The `X-Statsig-Request-Timestamp` header is a
 * Unix timestamp in MILLISECONDS.
 *
 * @param {string} rawBody - Raw request body as UTF-8 string
 * @param {string} signatureHeader - X-Statsig-Signature header value (e.g. "v0=abc...")
 * @param {string} timestampHeader - X-Statsig-Request-Timestamp header value (Unix ms)
 * @param {string} signingSecret - Statsig webhook signing secret
 * @returns {boolean}
 */
function verifyStatsigRequest(rawBody, signatureHeader, timestampHeader, signingSecret) {
  if (!signatureHeader || !timestampHeader || !signingSecret) {
    return false;
  }

  // Statsig's timestamp is a Unix time in MILLISECONDS (13 digits)
  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  // Replay protection (best practice; Statsig does not document a tolerance):
  // reject requests whose timestamp is more than 5 minutes from now.
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
    return false;
  }

  // Statsig signs the literal string: "v0:" + timestamp + ":" + raw body
  const basestring = `v0:${timestampHeader}:${rawBody}`;
  const expected = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(basestring, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Statsig webhook endpoint — must use raw body for signature verification
app.post('/webhooks/statsig',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-statsig-signature'];
    const timestamp = req.headers['x-statsig-request-timestamp'];
    const rawBody = req.body.toString('utf8');

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // URL validation handshake (sent when the integration is saved): echo the
    // code back or the webhook never registers. It only reflects a
    // caller-supplied value, so it is answered before signature verification.
    if (payload?.data?.event === 'url_verification') {
      return res.status(200).json({ verification_code: payload.data.verification_code });
    }

    if (!verifyStatsigRequest(rawBody, signature, timestamp, process.env.STATSIG_WEBHOOK_SECRET)) {
      console.error('Statsig signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Statsig delivers batches. Config changes arrive as { data: [...] };
    // exposure events arrive as a top-level JSON array.
    const items = Array.isArray(payload) ? payload : (payload.data || []);

    for (const item of items) {
      const meta = item.metadata || {};

      if (meta.action) {
        // Config change — metadata: type / name / description / action
        console.log(`Config change: ${meta.type} "${meta.name}" was ${meta.action}`);
        // TODO: sync config state, audit log, notify a channel
      } else {
        // Exposure event
        console.log(`Exposure event: ${item.eventName} (user: ${item.user?.userID ?? 'unknown'})`);
        // TODO: analytics, monitoring
      }
    }

    // Acknowledge quickly; process heavy work asynchronously
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyStatsigRequest };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/statsig`);
  });
}
