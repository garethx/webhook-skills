// Generated with: telnyx-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const nacl = require('tweetnacl');

const app = express();
const PORT = process.env.PORT || 3000;

// Reject webhooks whose timestamp is more than this many seconds old (replay defense).
// Matches Telnyx's official SDK default of 5 minutes.
const TOLERANCE_SECONDS = 300;

/**
 * Verify a Telnyx webhook using Ed25519.
 *
 * Telnyx signs the string `${telnyx-timestamp}|${raw_body}` with an Ed25519
 * private key. Verify it with your account's base64 public key from
 * Mission Control → Account Settings → Keys & Credentials → Public Key.
 *
 * @param {Buffer|string} rawBody - the exact raw request body bytes
 * @param {string} signature - `telnyx-signature-ed25519` header (base64)
 * @param {string} timestamp - `telnyx-timestamp` header (unix seconds)
 * @param {string} publicKey - account public key (base64, 32 bytes)
 */
function verifyTelnyxSignature(rawBody, signature, timestamp, publicKey) {
  // Enforce timestamp tolerance to block replays.
  const now = Math.floor(Date.now() / 1000);
  const webhookTime = parseInt(timestamp, 10);
  if (!Number.isFinite(webhookTime) || Math.abs(now - webhookTime) > TOLERANCE_SECONDS) {
    return false;
  }

  // Signed content is `timestamp|body` — use the RAW body, never re-serialized JSON.
  const signedPayload = Buffer.concat([
    Buffer.from(`${timestamp}|`, 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8'),
  ]);

  try {
    return nacl.sign.detached.verify(
      new Uint8Array(signedPayload),
      new Uint8Array(Buffer.from(signature, 'base64')),
      new Uint8Array(Buffer.from(publicKey, 'base64'))
    );
  } catch {
    return false; // malformed base64 / wrong lengths = invalid
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Telnyx webhook endpoint.
// IMPORTANT: use express.raw() — Ed25519 verification needs the exact raw body bytes.
app.post(
  '/webhooks/telnyx',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const publicKey = process.env.TELNYX_PUBLIC_KEY;
    if (!publicKey) {
      console.error('TELNYX_PUBLIC_KEY is not configured');
      return res.status(500).send('Server configuration error');
    }

    const signature = req.headers['telnyx-signature-ed25519'];
    const timestamp = req.headers['telnyx-timestamp'];
    if (!signature || !timestamp) {
      return res.status(400).send('Missing Telnyx signature headers');
    }

    if (!verifyTelnyxSignature(req.body, signature, timestamp, publicKey)) {
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON payload');
    }

    // Telnyx wraps every webhook in a `data` envelope.
    const data = event.data || {};
    const eventType = data.event_type;
    const payload = data.payload || {};
    console.log(`Received Telnyx event: ${eventType} (${data.id})`);

    switch (eventType) {
      case 'message.received':
        console.log('Inbound message:', {
          id: payload.id,
          from: payload.from?.phone_number,
          text: payload.text,
        });
        // TODO: process the inbound SMS/MMS.
        break;
      case 'message.sent':
        console.log('Message sent to carrier:', { id: payload.id });
        // TODO: record that the message left Telnyx.
        break;
      case 'message.finalized':
        console.log('Message finalized:', {
          id: payload.id,
          to: payload.to?.map((r) => ({ number: r.phone_number, status: r.status })),
        });
        // TODO: update delivery status (delivered / failed).
        break;
      default:
        console.log('Unhandled event type:', eventType);
    }

    // Acknowledge fast: Telnyx expects a 2xx within 2000ms or it retries.
    return res.status(200).json({ received: true });
  }
);

const server = app.listen(PORT, () => {
  console.log(`Telnyx webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/telnyx`);
});

module.exports = { app, server, verifyTelnyxSignature };
