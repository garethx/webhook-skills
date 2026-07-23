// Generated with: exact-online-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Exact Online webhook.
 *
 * Exact does NOT use Standard Webhooks and sends no signature header. The
 * signature is the `HashCode` field inside the JSON body:
 *
 *   {"Content":{...},"HashCode":"<UPPERCASE HEX>"}
 *
 * HashCode = HMAC-SHA256(secret, <raw JSON of the Content node>), hex, uppercased.
 * We must hash the exact raw substring of Content, not a re-serialized object.
 *
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string} secret - Exact App Center Webhook secret
 * @returns {boolean} - Whether the HashCode is valid
 */
function verifyExactWebhook(rawBody, secret) {
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const prefix = '{"Content":';
  const marker = ',"HashCode":';
  const start = raw.indexOf(prefix);
  const end = raw.lastIndexOf(marker); // HashCode is last, so use lastIndexOf
  if (start === -1 || end === -1 || end < start) {
    return false;
  }

  // Exact bytes Exact signed — do NOT re-serialize the parsed Content object.
  const contentJson = raw.slice(start + prefix.length, end);

  let hashCode;
  try {
    hashCode = JSON.parse(raw).HashCode;
  } catch {
    return false;
  }
  if (!hashCode) {
    return false;
  }
  // No secret configured means we cannot verify anything — fail closed rather
  // than throwing an opaque 500 from createHmac(…, undefined).
  if (!secret) {
    console.error('EXACT_WEBHOOK_SECRET is not set — rejecting delivery');
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(contentJson, 'utf8')
    .digest('hex')
    .toUpperCase();

  // Timing-safe compare; uppercase both sides so hex casing never trips us up.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(String(hashCode).toUpperCase())
    );
  } catch {
    return false;
  }
}

// Exact Online webhook endpoint — must use the raw body for verification.
app.post(
  '/webhooks/exact-online',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    // Verify before parsing.
    if (!verifyExactWebhook(req.body, process.env.EXACT_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Safe to parse now that the HashCode checks out.
    const { Content } = JSON.parse(req.body.toString('utf8'));
    const { Topic, Action, Key, Division } = Content;

    console.log(`Received ${Topic} ${Action} for ${Key} (division ${Division})`);

    // The payload is thin — fetch the full record from the REST API using Key +
    // Division (skip on Delete). Return 200 quickly; do slow work asynchronously.
    switch (Topic) {
      case 'Accounts':
        // TODO: GET /api/v1/{Division}/crm/Accounts?$filter=ID eq guid'{Key}'
        break;

      case 'Items':
        // TODO: GET /api/v1/{Division}/logistics/Items?$filter=ID eq guid'{Key}'
        break;

      case 'StockPositions':
        // TODO: sync inventory / reorder alerts
        break;

      case 'FinancialTransactions':
        // TODO: reconciliation / reporting
        break;

      case 'GoodsDeliveries':
        // TODO: fulfilment / shipping
        break;

      case 'Contacts':
        // TODO: CRM sync
        break;

      default:
        console.log(`Unhandled topic: ${Topic}`);
    }

    // Acknowledge quickly so Exact does not retry.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyExactWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/exact-online`);
  });
}
