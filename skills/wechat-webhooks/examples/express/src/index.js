// Generated with: wechat-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// WeChat Pay platform public key (PEM) — selected by the Wechatpay-Serial header.
const PLATFORM_PUBLIC_KEY = process.env.WECHAT_PAY_PUBLIC_KEY;
// 32-character APIv3 key used to decrypt resource.ciphertext.
const API_V3_KEY = process.env.WECHAT_PAY_API_V3_KEY;
// Optional: assert the notification was signed by the expected platform cert.
const PLATFORM_SERIAL = process.env.WECHAT_PAY_PLATFORM_SERIAL;

const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * Verify the WeChat Pay APIv3 signature.
 * Signed message is "{timestamp}\n{nonce}\n{body}\n" (SHA256withRSA),
 * verified against the platform public key matched by Wechatpay-Serial.
 */
function verifySignature(timestamp, nonce, rawBody, signatureB64, publicKey) {
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const verifier = crypto.createVerify('RSA-SHA256').update(message, 'utf8');
  try {
    return verifier.verify(publicKey, signatureB64, 'base64');
  } catch {
    return false; // malformed key or signature
  }
}

/**
 * Decrypt resource.ciphertext (AEAD_AES_256_GCM) with the 32-byte APIv3 key.
 * The 16-byte auth tag is appended to the ciphertext.
 */
function decryptResource(resource, apiV3Key) {
  const buf = Buffer.from(resource.ciphertext, 'base64');
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', apiV3Key, resource.nonce);
  decipher.setAuthTag(authTag);
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data));
  }
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

// WeChat Pay notifications require the RAW body for signature verification.
app.post('/webhooks/wechat', express.raw({ type: '*/*' }), (req, res) => {
  const timestamp = req.headers['wechatpay-timestamp'];
  const nonce = req.headers['wechatpay-nonce'];
  const signature = req.headers['wechatpay-signature'];
  const serial = req.headers['wechatpay-serial'];

  if (!timestamp || !nonce || !signature || !serial) {
    return res.status(400).json({ code: 'FAIL', message: 'Missing WeChat Pay signature headers' });
  }

  // Reject stale notifications (replay protection).
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > TIMESTAMP_TOLERANCE_SECONDS) {
    return res.status(400).json({ code: 'FAIL', message: 'Timestamp outside tolerance' });
  }

  // Optionally assert the signing certificate serial.
  if (PLATFORM_SERIAL && serial !== PLATFORM_SERIAL) {
    return res.status(400).json({ code: 'FAIL', message: 'Unknown platform serial' });
  }

  const rawBody = req.body.toString('utf8');
  if (!verifySignature(timestamp, nonce, rawBody, signature, PLATFORM_PUBLIC_KEY)) {
    return res.status(401).json({ code: 'FAIL', message: 'Invalid signature' });
  }

  let notification;
  let resource;
  try {
    notification = JSON.parse(rawBody);
    resource = decryptResource(notification.resource, API_V3_KEY);
  } catch (err) {
    console.error('Failed to decrypt resource:', err.message);
    return res.status(400).json({ code: 'FAIL', message: 'Failed to decrypt resource' });
  }

  // Handle the event. Re-verify amounts against your order before fulfilling,
  // and process idempotently keyed on notification.id / resource.transaction_id.
  switch (notification.event_type) {
    case 'TRANSACTION.SUCCESS':
      console.log('Payment succeeded:', resource.out_trade_no, resource.amount);
      // TODO: mark order paid, fulfill, send receipt
      break;

    case 'REFUND.SUCCESS':
      console.log('Refund succeeded:', resource.out_refund_no);
      // TODO: update refund status, notify customer
      break;

    case 'REFUND.CLOSED':
      console.log('Refund closed:', resource.out_refund_no);
      // TODO: flag for manual review / reconciliation
      break;

    default:
      console.log(`Unhandled event type: ${notification.event_type}`);
  }

  // Acknowledge. HTTP 200/204 tells WeChat Pay to stop retrying.
  return res.status(200).json({ code: 'SUCCESS', message: 'OK' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/wechat`);
  });
}

module.exports.verifySignature = verifySignature;
module.exports.decryptResource = decryptResource;
