// Generated with: shipstation-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

// V1 resource_url hosts are reportedly numbered (ssapi1/ssapi2.shipstation.com),
// so match a pattern rather than a single fixed hostname.
const SHIPSTATION_HOST_RE = /^ssapi\d*\.shipstation\.com$/;

// ShipStation V1 events (the resource_type field on every delivery)
const EVENTS = {
  ORDER_NOTIFY: 'ORDER_NOTIFY',
  ITEM_ORDER_NOTIFY: 'ITEM_ORDER_NOTIFY',
  SHIP_NOTIFY: 'SHIP_NOTIFY',
  ITEM_SHIP_NOTIFY: 'ITEM_SHIP_NOTIFY',
  FULFILLMENT_SHIPPED: 'FULFILLMENT_SHIPPED',
  FULFILLMENT_REJECTED: 'FULFILLMENT_REJECTED',
};

/**
 * ShipStation V1 has NO signature. Secure the endpoint by comparing an
 * unguessable token from the ?token= query string, timing-safe.
 */
function verifyToken(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard it
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Fetch the thin payload's resource_url with HTTP Basic auth.
 * Only ShipStation's own host is ever requested (SSRF guard).
 */
async function fetchResource(resourceUrl) {
  const key = process.env.SHIPSTATION_API_KEY;
  const secret = process.env.SHIPSTATION_API_SECRET;
  if (!key || !secret) return null; // no credentials configured — skip fetch

  if (!SHIPSTATION_HOST_RE.test(new URL(resourceUrl).hostname)) {
    throw new Error(`Refusing to fetch non-ShipStation host: ${resourceUrl}`);
  }

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(resourceUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (res.status === 429) {
    // V1 rate limit: 40 req/min per key
    throw new Error(`Rate limited; reset in ${res.headers.get('X-Rate-Limit-Reset')}s`);
  }
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

// No signature to verify, so parsing JSON directly is safe here.
app.post('/webhooks/shipstation', express.json(), async (req, res) => {
  // 1. Verify the secret token from the query string
  if (!verifyToken(req.query.token, process.env.SHIPSTATION_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid or missing webhook token');
  }

  // 2. Thin payload: { resource_url, resource_type }
  const { resource_url: resourceUrl, resource_type: resourceType } = req.body || {};
  if (!resourceType || !resourceUrl) {
    return res.status(400).send('Missing resource_type or resource_url');
  }

  // 3. Dispatch on the event type
  switch (resourceType) {
    case EVENTS.ORDER_NOTIFY:
    case EVENTS.ITEM_ORDER_NOTIFY:
      console.log('New order(s) imported:', resourceUrl);
      // TODO: sync orders into your system
      break;
    case EVENTS.SHIP_NOTIFY:
    case EVENTS.ITEM_SHIP_NOTIFY:
      console.log('Order(s) shipped:', resourceUrl);
      // TODO: send tracking notifications, mark fulfilled
      break;
    case EVENTS.FULFILLMENT_SHIPPED:
      console.log('Fulfillment shipped:', resourceUrl);
      // TODO: update fulfillment status
      break;
    case EVENTS.FULFILLMENT_REJECTED:
      console.log('Fulfillment rejected:', resourceUrl);
      // TODO: handle rejected fulfillment
      break;
    default:
      console.log(`Unhandled resource_type: ${resourceType}`);
  }

  // 4. Fetch the real data from resource_url (authenticated). Never let a
  // downstream fetch error turn into a 500 — we've already validated the request.
  try {
    const resource = await fetchResource(resourceUrl);
    if (resource) {
      console.log('Fetched resource for', resourceType);
      // TODO: process `resource` idempotently (dedupe on order/shipment id)
    }
  } catch (err) {
    console.error('Resource fetch failed:', err.message);
  }

  // 5. Acknowledge receipt
  res.status(200).json({ received: true });
});

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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/shipstation?token=...`);
  });
}
