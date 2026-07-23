// Generated with: walmart-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Reject deliveries whose timestamp differs from now by more than this, in either
// direction (a symmetric ±5 min window that also absorbs modest clock skew).
// Walmart's WM_SEC.TIMESTAMP is Unix epoch seconds.
const REPLAY_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Walmart performance webhook signature.
 *
 * Walmart signs a canonical string, NOT the raw body directly:
 *   <METHOD>\n<PATH_AND_QUERY>\n<WM_SEC.TIMESTAMP>\n<SHA256_HEX_OF_RAW_BODY>
 * signature = base64(HMAC_SHA256(secret, stringToSign))
 *
 * @param {object} params
 * @param {string} params.method        - HTTP method (uppercased internally)
 * @param {string} params.pathWithQuery - Request path including query string
 * @param {string} params.timestamp     - WM_SEC.TIMESTAMP header value
 * @param {Buffer|string} params.rawBody - Raw request body (unparsed)
 * @param {string} params.signature     - WM_SEC.SIGNATURE header value (base64)
 * @param {string} params.secret        - Shared webhook secret
 * @returns {boolean}
 */
function verifyWalmartWebhook({ method, pathWithQuery, timestamp, rawBody, signature, secret }) {
  if (!timestamp || !signature) return false;

  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex'); // lowercase hex
  const stringToSign = [method.toUpperCase(), pathWithQuery, timestamp, bodyHash].join('\n');
  const expected = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // length mismatch = invalid
  }
}

/**
 * Reject stale deliveries to mitigate replay attacks.
 * @param {string} timestamp - WM_SEC.TIMESTAMP (Unix epoch seconds)
 */
function isTimestampFresh(timestamp, toleranceSeconds = REPLAY_TOLERANCE_SECONDS) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= toleranceSeconds;
}

// Walmart webhook endpoint - must use the RAW body for signature verification.
app.post('/webhooks/walmart',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const timestamp = req.headers['wm_sec.timestamp'];
    const signature = req.headers['wm_sec.signature'];
    // const keyId = req.headers['wm_sec.key_id']; // optional: select secret during rotation

    // 1. Verify the signature over the raw body.
    const valid = verifyWalmartWebhook({
      method: req.method,
      pathWithQuery: req.originalUrl,
      timestamp,
      rawBody: req.body,
      signature,
      secret: process.env.WALMART_WEBHOOK_SECRET,
    });

    if (!valid) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // 2. Reject stale/replayed deliveries.
    if (!isTimestampFresh(timestamp)) {
      console.error('Webhook timestamp outside replay window');
      return res.status(400).send('Stale timestamp');
    }

    // 3. Parse only after verification.
    const payload = JSON.parse(req.body.toString('utf8'));
    const eventType = payload.eventType;

    // 4. Confirm the seller is one you're authorized to process.
    // if (!isAuthorizedSeller(payload.sellerId)) return res.status(202).send('Ignored');

    console.log(`Received ${eventType} (${payload.resourceName}) for seller ${payload.sellerId}`);

    // 5. Handle the event by type.
    switch (eventType) {
      case 'PO_CREATED':
        console.log('New purchase order:', payload.resource?.purchaseOrderId);
        // TODO: reserve inventory, acknowledge order, start pick/pack/ship
        break;

      case 'PO_LINE_AUTOCANCELLED':
        console.log('PO line auto-cancelled:', payload.resource?.purchaseOrderId);
        // TODO: release inventory, update OMS
        break;

      case 'INTENT_TO_CANCEL':
        console.log('Customer intent to cancel:', payload.resource?.purchaseOrderId);
        // TODO: halt fulfillment if not yet shipped
        break;

      case 'INVENTORY_OOS':
        console.log('Item out of stock:', payload.resource);
        // TODO: trigger replenishment
        break;

      case 'OFFER_PUBLISHED':
        console.log('Offer published:', payload.resource);
        // TODO: enable listing in your catalog
        break;

      case 'OFFER_UNPUBLISHED':
        console.log('Offer unpublished:', payload.resource);
        // TODO: investigate suppression
        break;

      case 'BUY_BOX_CHANGED':
        console.log('Buy Box changed:', payload.resource);
        // TODO: reprice, alert pricing team
        break;

      case 'RETURN_CREATED':
        console.log('Return created:', payload.resource);
        // TODO: start returns workflow
        break;

      case 'REPORT_STATUS':
        console.log('Report ready:', payload.resource);
        // TODO: download and ingest the report
        break;

      case 'SELLER_PERFORMANCE_ALARMS':
        console.log('Seller performance alarm:', payload.resource);
        // TODO: alert account team
        break;

      default:
        console.log(`Unhandled eventType: ${eventType}`);
    }

    // 6. Acknowledge only AFTER durable work. Respond within 3 seconds.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyWalmartWebhook, isTimestampFresh };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/walmart`);
  });
}
