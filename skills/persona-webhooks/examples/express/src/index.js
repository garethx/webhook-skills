// Generated with: persona-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the Persona-Signature header.
 *
 * Header format:  t=<unix_seconds>,v1=<hex_signature>
 * Signed content: `${t}.${raw_body}`
 * Algorithm:      HMAC-SHA256 with the per-webhook secret (wbhsec_...), hex.
 *
 * During secret rotation Persona sends TWO space-separated `t=...,v1=...`
 * pairs (old + new secret). Accept the request if ANY v1 matches the secret
 * you hold. Persona documents no timestamp tolerance — signature validity is
 * the check; add your own replay window only if you need one.
 */
function verifyPersonaSignature(rawBody, header, secret) {
  if (!header) {
    return { valid: false, error: 'Missing Persona-Signature header' };
  }

  const pairs = header.trim().split(/\s+/);
  let sawPair = false;

  for (const pair of pairs) {
    const parts = pair.split(',');
    const tPart = parts.find((p) => p.startsWith('t='));
    const vPart = parts.find((p) => p.startsWith('v1='));
    const t = tPart ? tPart.slice(2) : null;
    const v1 = vPart ? vPart.slice(3) : null;
    if (!t || !v1) continue;
    sawPair = true;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${t}.${rawBody}`)
      .digest('hex');

    const a = Buffer.from(v1, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) continue;

    try {
      if (crypto.timingSafeEqual(a, b)) {
        return { valid: true };
      }
    } catch {
      // Length mismatch handled above; anything else means invalid.
    }
  }

  if (!sawPair) {
    return { valid: false, error: 'Malformed Persona-Signature header' };
  }
  return { valid: false, error: 'Invalid signature' };
}

// Persona webhook endpoint — must use raw body for signature verification.
app.post(
  '/webhooks/persona',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const rawBody = req.body.toString('utf8');
    const header = req.headers['persona-signature'];

    const verification = verifyPersonaSignature(
      rawBody,
      header,
      process.env.PERSONA_WEBHOOK_SECRET
    );

    if (!verification.valid) {
      console.error('Persona webhook verification failed:', verification.error);
      return res.status(400).send(`Webhook Error: ${verification.error}`);
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      console.error('Invalid JSON payload:', err.message);
      return res.status(400).send('Invalid JSON payload');
    }

    // Persona payloads are JSON:API envelopes:
    //   data.attributes.name          -> event type (e.g. "inquiry.completed")
    //   data.attributes.payload.data  -> the affected object (same schema as the API)
    //   data.attributes.created-at    -> use to order events; delivery is not ordered
    const attributes = event.data?.attributes || {};
    const eventName = attributes.name;
    const object = attributes.payload?.data;

    // Persona may deliver duplicates and out of order — use event.data.id as the
    // idempotency key and order by data.attributes.created-at in real handlers.
    switch (eventName) {
      case 'inquiry.created':
        console.log('Inquiry created:', object?.id);
        break;
      case 'inquiry.started':
        console.log('Inquiry started:', object?.id);
        break;
      case 'inquiry.completed':
        console.log('Inquiry completed:', object?.id);
        break;
      case 'inquiry.approved':
        console.log('Inquiry approved:', object?.id);
        break;
      case 'inquiry.declined':
        console.log('Inquiry declined:', object?.id);
        break;
      case 'inquiry.marked-for-review':
        console.log('Inquiry marked for review:', object?.id);
        break;
      case 'inquiry.failed':
        console.log('Inquiry failed:', object?.id);
        break;
      case 'inquiry.expired':
        console.log('Inquiry expired:', object?.id);
        break;
      case 'verification.passed':
        console.log('Verification passed:', object?.id);
        break;
      case 'verification.failed':
        console.log('Verification failed:', object?.id);
        break;
      case 'account.created':
        console.log('Account created:', object?.id);
        break;
      case 'account.archived':
        console.log('Account archived:', object?.id);
        break;
      case 'case.created':
        console.log('Case created:', object?.id);
        break;
      case 'case.resolved':
        console.log('Case resolved:', object?.id);
        break;
      case 'report/watchlist.ready':
        console.log('Watchlist report ready:', object?.id);
        break;
      default:
        console.log(`Unhandled event type: ${eventName}`);
    }

    // Persona treats 200/201/202/204 as success; anything else is retried.
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPersonaSignature = verifyPersonaSignature;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/persona`);
  });
}
