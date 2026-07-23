// Generated with: bigcommerce-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const { Webhook, WebhookVerificationError } = require('standardwebhooks');

const app = express();

// BigCommerce signs callbacks using the Standard Webhooks spec.
// The signing key is your app's CLIENT SECRET, base64-encoded. The
// standardwebhooks library base64-decodes whatever you pass in, so encoding
// the client secret first yields the raw client-secret bytes as the HMAC key.
const clientSecret = process.env.BIGCOMMERCE_CLIENT_SECRET || '';
const wh = new Webhook(Buffer.from(clientSecret).toString('base64'));

// BigCommerce webhook endpoint - must use the raw body for signature verification.
app.post(
  '/webhooks/bigcommerce',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    let event;
    try {
      // verify() checks the HMAC-SHA256 signature over
      // `${webhook-id}.${webhook-timestamp}.${rawBody}`, enforces the
      // timestamp tolerance (replay protection), and returns the parsed JSON.
      event = wh.verify(req.body, {
        'webhook-id': req.headers['webhook-id'],
        'webhook-timestamp': req.headers['webhook-timestamp'],
        'webhook-signature': req.headers['webhook-signature'],
      });
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        console.error('BigCommerce webhook verification failed:', err.message);
        return res.status(400).send('Invalid signature');
      }
      console.error('Failed to process webhook:', err);
      return res.status(400).send('Invalid payload');
    }

    // BigCommerce payloads are thin: `scope` is the event, `data` carries only
    // the resource type and id. Call back to the REST API to fetch full details.
    const { scope, data } = event;

    switch (scope) {
      case 'store/order/created':
        console.log(`Order created: ${data?.id}`);
        // TODO: Fetch the order via GET /v2/orders/{id}, fulfil, notify
        break;

      case 'store/order/updated':
        console.log(`Order updated: ${data?.id}`);
        // TODO: Re-sync order details
        break;

      case 'store/order/statusUpdated':
        console.log(`Order status updated: ${data?.id}`);
        // TODO: Fetch order status, trigger fulfilment or refund flows
        break;

      case 'store/product/created':
        console.log(`Product created: ${data?.id}`);
        // TODO: Index the new product in your catalog
        break;

      case 'store/product/updated':
        console.log(`Product updated: ${data?.id}`);
        // TODO: Re-sync product details
        break;

      case 'store/product/deleted':
        console.log(`Product deleted: ${data?.id}`);
        // TODO: Remove the product from your catalog
        break;

      case 'store/product/inventory/updated':
        console.log(`Product inventory updated: ${data?.id}`);
        // TODO: Update stock levels downstream
        break;

      case 'store/customer/created':
        console.log(`Customer created: ${data?.id}`);
        // TODO: Sync customer to CRM / marketing list
        break;

      case 'store/cart/created':
        console.log(`Cart created: ${data?.id}`);
        // TODO: Track cart for analytics
        break;

      case 'store/cart/abandoned':
        console.log(`Cart abandoned: ${data?.id}`);
        // TODO: Trigger an abandoned-cart recovery email
        break;

      default:
        console.log(`Unhandled scope: ${scope}`);
    }

    // Respond 200 immediately so BigCommerce marks delivery successful.
    // Do heavy work asynchronously (queue) to avoid retries and blocklisting.
    res.status(200).json({ received: true });
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bigcommerce`);
  });
}
