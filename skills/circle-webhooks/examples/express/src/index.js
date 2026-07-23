// Generated with: circle-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const { createPublicKey, createVerify } = require('crypto');

const app = express();

// Circle production: https://api.circle.com — sandbox: https://api-sandbox.circle.com
const CIRCLE_API_BASE_URL = process.env.CIRCLE_API_BASE_URL || 'https://api.circle.com';

// Public key cache — keyed by the X-Circle-Key-Id UUID. The public key for a
// given keyId is static, so a cache miss == fetch once. Exported so tests can
// preload it and avoid a real API call.
const publicKeyCache = new Map();

async function getPublicKey(keyId) {
  if (publicKeyCache.has(keyId)) return publicKeyCache.get(keyId);

  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error('CIRCLE_API_KEY is not set');

  const res = await fetch(
    `${CIRCLE_API_BASE_URL}/v2/cpn/notifications/publicKey/${keyId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch public key: ${res.status}`);
  const { data } = await res.json();

  // Circle returns a base64-encoded DER (SPKI) ECDSA public key.
  const publicKey = createPublicKey({
    key: Buffer.from(data.publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
  publicKeyCache.set(keyId, publicKey);
  return publicKey;
}

async function verifyCircleWebhook(headers, rawBody) {
  // Header names arrive lowercased in Node's http layer.
  const signature = headers['x-circle-signature'];
  const keyId = headers['x-circle-key-id'];
  if (!signature || !keyId) return false;

  let publicKey;
  try {
    publicKey = await getPublicKey(keyId);
  } catch (err) {
    console.error('Could not load Circle public key:', err.message);
    return false;
  }

  // ECDSA_SHA_256 over the RAW request body; the signature is base64-encoded.
  const verifier = createVerify('SHA256');
  verifier.update(rawBody);
  verifier.end();
  try {
    return verifier.verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
}

// Circle validates the endpoint with a HEAD request when a subscription is
// created or updated. Respond 200 so the subscription activates.
app.head('/webhooks/circle', (req, res) => res.status(200).end());

// CRITICAL: express.raw() — the signature is over the exact raw bytes, so the
// body must not be parsed to JSON before verification.
app.post(
  '/webhooks/circle',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const valid = await verifyCircleWebhook(req.headers, req.body);
    if (!valid) {
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Dedupe on event.notificationId (a UUID) — Circle retries non-200
    // deliveries, so the same notificationId can arrive more than once.
    const resource = event.notification || {};

    switch (event.notificationType) {
      case 'cpn.payment.completed': {
        console.log('Payment completed:', resource.id, resource.status);
        // TODO: reconcile the completed CPN payment
        break;
      }
      case 'cpn.payment.failed': {
        console.log('Payment failed:', resource.id, resource.status);
        // TODO: handle the failed payment (notify / retry)
        break;
      }
      case 'cpn.transaction.completed': {
        console.log('Transaction completed:', resource.id, resource.status);
        // TODO: mark the onchain transaction settled
        break;
      }
      case 'cpn.transaction.broadcasted': {
        console.log('Transaction broadcasted:', resource.id, resource.status);
        // TODO: track the broadcasted onchain transaction
        break;
      }
      case 'cpn.rfi.approved': {
        console.log('RFI approved:', resource.id, resource.status);
        // TODO: resume the payment now the request-for-information cleared
        break;
      }
      case 'cpn.rfi.rejected': {
        console.log('RFI rejected:', resource.id, resource.status);
        // TODO: handle the rejected request-for-information
        break;
      }
      default:
        // Other cpn.* types: cpn.payment.delayed, cpn.transaction.failed,
        // cpn.rfi.* (e.g. information-needed), etc.
        console.log(`Unhandled notification type: ${event.notificationType}`);
    }

    res.status(200).json({ received: true });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, publicKeyCache, verifyCircleWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/circle`);
  });
}
