// Generated with: tiktok-shop-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const APP_KEY = process.env.TIKTOK_SHOP_APP_KEY;
const APP_SECRET = process.env.TIKTOK_SHOP_APP_SECRET;

// TikTok Shop does NOT publish a complete numeric `type` -> topic mapping
// ("Do not branch only on the numeric type; use the subscribed event_type
// context" — official webhooks overview). Only `type: 1` appears in the
// official sample payload, for ORDER_STATUS_CHANGE. Fill this map from YOUR
// OWN Partner Center subscriptions — or better, register a distinct callback
// URL per event_type (the Update Shop Webhook API takes one address per
// topic) so the route itself identifies the event.
const SUBSCRIBED_TYPE_TO_EVENT = {
  1: 'ORDER_STATUS_CHANGE', // per the official sample payload
};

/**
 * Verify a TikTok Shop webhook signature.
 *
 * TikTok Shop signs: HMAC-SHA256(key = app_secret, message = app_key + rawBody),
 * lowercase hex, delivered in the `Authorization` header (no "Bearer" prefix).
 * There is no timestamp in the signature (no replay protection).
 */
function verifyTikTokShop(rawBody, authHeader, appKey, appSecret) {
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(appKey + rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(authHeader || '', 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

// Must use the raw body for signature verification — do not JSON.parse first.
app.post(
  '/webhooks/tiktok-shop',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).send('Missing Authorization header');
    }

    // req.body is a Buffer from express.raw(); sign the exact bytes as UTF-8.
    const rawBody = req.body.toString('utf8');

    if (!verifyTikTokShop(rawBody, authHeader, APP_KEY, APP_SECRET)) {
      // TikTok Shop treats 401 as a rejected signature.
      return res.status(401).send('Invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Delivery is at-least-once: dedupe on tts_notification_id before processing.
    // e.g. if (await seen(payload.tts_notification_id)) return res.status(200).send();

    const eventName = SUBSCRIBED_TYPE_TO_EVENT[payload.type] || `UNKNOWN_TYPE_${payload.type}`;

    switch (eventName) {
      case 'ORDER_STATUS_CHANGE':
        console.log('Order status changed:', payload.data?.order_id, payload.data?.order_status);
        // TODO: sync order, trigger fulfilment, notify customer, etc.
        break;

      case 'RECIPIENT_ADDRESS_UPDATE':
        console.log('Recipient address updated:', payload.data?.order_id);
        // TODO: refresh shipping label / warehouse record.
        break;

      case 'PACKAGE_UPDATE':
        console.log('Package updated:', payload.data?.package_id);
        // TODO: re-fetch package details, update tracking.
        break;

      case 'PRODUCT_STATUS_CHANGE':
        console.log('Product status changed:', payload.data?.product_id);
        // TODO: sync catalog availability.
        break;

      case 'SELLER_DEAUTHORIZATION':
        console.log('Seller deauthorized shop:', payload.shop_id);
        // TODO: disable sync, purge stored access tokens for this shop.
        break;

      default:
        console.log(`Unhandled event (type=${payload.type}): ${eventName}`);
    }

    // Acknowledge within 3 seconds: 200 with an empty body.
    return res.status(200).send();
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tiktok-shop`);
  });
}
