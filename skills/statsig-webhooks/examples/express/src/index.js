require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const webhookSecret = process.env.STATSIG_WEBHOOK_SECRET;

// Verify the Statsig webhook signature.
// Signature is `v0=<hmac-sha256-hex>` over the basestring `v0:<timestamp>:<rawBody>`.
function verifyStatsigWebhook(rawBody, timestamp, signatureHeader, secret) {
  if (!timestamp || !signatureHeader) return false;

  const basestring = `v0:${timestamp}:${rawBody}`;
  const expected =
    'v0=' + crypto.createHmac('sha256', secret).update(basestring).digest('hex');

  const sigBuf = Buffer.from(signatureHeader, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

// Statsig webhook endpoint - must use raw body for signature verification
app.post('/webhooks/statsig',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const rawBody = req.body.toString('utf8');
    const timestamp = req.headers['x-statsig-request-timestamp'];
    const signature = req.headers['x-statsig-signature'];

    if (!verifyStatsigWebhook(rawBody, timestamp, signature, webhookSecret)) {
      console.error('Webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Signature verified - safe to parse
    const payload = JSON.parse(rawBody);

    // Statsig delivers events in batches: { "data": [ ... ] }
    const events = Array.isArray(payload.data) ? payload.data : [];

    for (const event of events) {
      switch (event.eventName) {
        case 'statsig::gate_exposure':
          console.log('Gate exposure:', event.metadata && event.metadata.gate);
          // TODO: record exposure, update analytics, etc.
          break;

        case 'statsig::config_exposure':
          console.log('Config exposure:', event.metadata && event.metadata.config);
          // TODO: record exposure, etc.
          break;

        case 'statsig::experiment_exposure':
          console.log('Experiment exposure:', event.metadata && event.metadata.config);
          // TODO: record experiment assignment, etc.
          break;

        case 'statsig::config_change':
          console.log('Config change:', event.metadata);
          // TODO: audit configuration changes, etc.
          break;

        default:
          // Custom events logged via logEvent
          console.log('Custom event:', event.eventName);
      }
    }

    // Return 200 to acknowledge receipt
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/statsig`);
  });
}
