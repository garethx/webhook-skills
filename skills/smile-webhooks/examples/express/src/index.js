// Generated with: smile-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

const WEBHOOK_SECRET = process.env.SMILE_WEBHOOK_SECRET;

/**
 * Verify the `Smile-Signature` header.
 *
 * Smile signs the RAW request body with HMAC-SHA512 (hex), keyed with the
 * per-endpoint secret you set at registration. We recompute the digest and
 * compare in constant time. Never sign a re-serialized parsed body — the bytes
 * (and therefore the signature) would differ.
 */
function verifySmileSignature(rawBody, signatureHeader, secret) {
  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex');
  const received = Buffer.from(String(signatureHeader || ''), 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws when the buffers differ in length — guard first.
  return (
    received.length === computed.length &&
    crypto.timingSafeEqual(received, computed)
  );
}

/** Dispatch on the `type` field of the JSON body. */
function handleEvent(event) {
  switch (event.type) {
    case 'ACCOUNT_CONNECTED':
      console.log(`Account connected: ${event.data?.accountId}`);
      // TODO: kick off data collection, update UI.
      break;
    case 'ACCOUNT_DISCONNECTED':
      console.log(`Account disconnected: ${event.data?.accountId}`);
      // TODO: stop syncing, notify the user.
      break;
    case 'TASK_FINISHED':
      console.log(`Task finished: ${event.id}`);
      // TODO: pull results (or read inlined data if includePayload is on).
      break;
    case 'IDENTITY_ADDED':
      console.log(`Identity added: ${event.data?.userId}`);
      // TODO: populate identity / profile fields.
      break;
    case 'INCOMES_ADDED':
      console.log(`Incomes added: ${event.data?.userId}`);
      // TODO: income verification / affordability.
      break;
    case 'EMPLOYMENTS_ADDED':
      console.log(`Employments added: ${event.data?.userId}`);
      // TODO: employment verification.
      break;
    case 'RECORD_COMPLETED':
      console.log(`Record completed: ${event.id}`);
      // TODO: finalize the application.
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// Capture the RAW body so the signature is computed over the exact bytes Smile
// sent, before any JSON parsing.
app.post('/webhooks/smile', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const signature = req.get('Smile-Signature');

  // 1) Require the signature header.
  if (!signature) {
    return res.status(400).json({ error: 'Missing Smile-Signature header' });
  }

  // 2) Verify the signature over the raw body (the real gate).
  if (!verifySmileSignature(rawBody, signature, WEBHOOK_SECRET)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // 3) Parse only AFTER the signature check passes.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 4) Handle the event. Dedupe on event.id — Smile retries up to 2 times.
  try {
    handleEvent(event);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // 5) Acknowledge with 2xx so Smile does not retry.
  return res.status(200).json({ received: true });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Listening for Smile webhooks on :${PORT}`));
}

module.exports = app;
