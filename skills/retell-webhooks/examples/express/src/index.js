require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Reject signatures whose timestamp is more than 5 minutes from now (replay guard)
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Verify a Retell webhook signature.
 *
 * Retell signs with HMAC-SHA256 using your Retell API key as the secret. The
 * X-Retell-Signature header is formatted "v={unix_ms_timestamp},d={hex_digest}"
 * where the digest is HMAC-SHA256 over (raw body + timestamp).
 *
 * The Retell Node SDK has no verify helper, so we verify manually with crypto —
 * this matches the Python SDK's client.verify algorithm exactly.
 */
function verifyRetellSignature(rawBody, signatureHeader, apiKey) {
  const match = /^v=(\d+),d=(.*)$/.exec(signatureHeader || '');
  if (!match) return false;
  const [, timestamp, digest] = match;

  if (Math.abs(Date.now() - Number(timestamp)) > FIVE_MINUTES_MS) return false;

  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(rawBody + timestamp) // raw body first, then the timestamp string
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(digest));
  } catch {
    return false; // different lengths = invalid
  }
}

// Capture the raw body so signature verification sees the exact bytes Retell sent
app.use('/webhooks/retell', express.raw({ type: 'application/json' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Retell webhook endpoint
app.post('/webhooks/retell', (req, res) => {
  const signature =
    req.headers['x-retell-signature'] || req.headers['X-Retell-Signature'];
  const apiKey = process.env.RETELL_API_KEY;

  if (!signature) {
    return res.status(400).json({ error: 'Missing X-Retell-Signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;

  if (!verifyRetellSignature(rawBody, signature, apiKey)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { event, call, chat } = payload;
  const id = call?.call_id || chat?.chat_id;
  console.log(`Received Retell webhook: ${event} (${id})`);

  // Dedupe on `event` + call_id/chat_id here — Retell retries up to 3 times.

  switch (event) {
    case 'call_started':
      console.log('Call started:', call?.call_id);
      break;
    case 'call_ended':
      console.log('Call ended:', call?.call_id);
      break;
    case 'call_analyzed':
      // Transcript, summary, and sentiment are available on this event
      console.log('Call analyzed:', call?.call_id);
      break;
    case 'transcript_updated':
      console.log('Transcript updated:', call?.call_id);
      break;
    case 'transfer_started':
    case 'transfer_bridged':
    case 'transfer_cancelled':
    case 'transfer_ended':
      console.log(`Transfer event ${event}:`, call?.call_id);
      break;
    case 'chat_started':
    case 'chat_ended':
    case 'chat_analyzed':
      console.log(`Chat event ${event}:`, chat?.chat_id);
      break;
    default:
      console.log('Unhandled event type:', event);
  }

  // Acknowledge quickly (within 10s) so Retell doesn't retry
  res.sendStatus(200);
});

// Start server only if not running under test
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Retell webhook server listening on port ${PORT}`);
  });
}

module.exports = app;
