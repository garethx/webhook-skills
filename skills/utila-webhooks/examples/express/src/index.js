// Generated with: utila-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Utila signs deliveries with an RSA-4096 PRIVATE key (SHA-512 + PSS padding)
// and sends the base64 signature in x-utila-signature. We verify with the
// matching PEM PUBLIC key from the Console (Vault Settings -> Webhooks).
// There is no shared secret and no timestamp header.
function loadPublicKey() {
  const pem = process.env.UTILA_WEBHOOK_PUBLIC_KEY;
  if (!pem) throw new Error('UTILA_WEBHOOK_PUBLIC_KEY is not set');
  // Support keys stored on a single line with escaped \n newlines.
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

function verifyUtilaSignature(rawBody, signatureB64) {
  if (!signatureB64) return false;
  try {
    return crypto.verify(
      'sha512',
      rawBody, // the exact request bytes, NOT parsed JSON
      {
        key: loadPublicKey(),
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_AUTO, // auto-detect PSS salt
      },
      Buffer.from(signatureB64, 'base64')
    );
  } catch {
    // Malformed key / signature / base64 => not authentic. Fail closed.
    return false;
  }
}

// CRITICAL: express.raw() — the signature is over the exact raw bytes, so the
// body must not be parsed to JSON before verification.
app.post('/webhooks/utila', express.raw({ type: '*/*' }), (req, res) => {
  // Header names arrive lowercased in Node's http layer.
  const signature = req.headers['x-utila-signature'];
  if (!verifyUtilaSignature(req.body, signature)) {
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Utila sends no timestamp, so dedupe on the event id — the same id can
  // arrive more than once because non-200 deliveries are retried for up to 24h.
  // TODO: check event.id against a store and skip if already processed.

  // Payloads are thin: id, vault, type, resourceType, resource, details.
  // Fetch the full object from the Utila API using event.resource when needed.
  switch (event.type) {
    case 'TRANSACTION_CREATED':
      console.log('Transaction created:', event.resource);
      // TODO: record the new transaction
      break;
    case 'TRANSACTION_STATE_UPDATED':
      console.log('Transaction state updated:', event.resource, event.details);
      // TODO: reconcile signing / completed / failed state
      break;
    case 'WALLET_CREATED':
      console.log('Wallet created:', event.resource);
      // TODO: provision downstream accounts for the new wallet
      break;
    case 'WALLET_ADDRESS_CREATED':
      console.log('Wallet address created:', event.resource);
      // TODO: register the new deposit address
      break;
    case 'TRANSACTION_AML_SCREENING_RESULT_READY':
      console.log('AML screening result ready:', event.resource, event.details);
      // TODO: gate settlement on the compliance result
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Acknowledge with 200 so Utila stops retrying.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyUtilaSignature };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/utila`);
  });
}
