// Generated with: polar-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const { validateEvent, WebhookVerificationError } = require('@polar-sh/sdk/webhooks');

const app = express();

// Polar webhook endpoint - must use the raw body for signature verification.
// Polar follows the Standard Webhooks spec: HMAC-SHA256 over
// `{webhook-id}.{webhook-timestamp}.{body}`, sent via the webhook-id,
// webhook-timestamp, and webhook-signature headers.
app.post(
  '/webhooks/polar',
  express.raw({ type: '*/*' }),
  (req, res) => {
    let event;
    try {
      // validateEvent verifies the signature AND parses the payload against the
      // SDK's typed schema in one call. Pass the raw body (Buffer), the request
      // headers, and the secret as-is — the SDK base64-encodes the secret for you.
      event = validateEvent(
        req.body,
        req.headers,
        process.env.POLAR_WEBHOOK_SECRET
      );
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        // Signature check failed -> the request is not from Polar. Reject it.
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send('Invalid signature');
      }
      // Signature was valid, but this SDK version could not parse the payload
      // (an unknown or newer event type). The event IS authentic, so acknowledge
      // it with a 2xx — returning an error would make Polar retry and, after 10
      // consecutive failures, auto-disable the endpoint.
      console.warn('Received a valid webhook the SDK could not parse:', err.message);
      return res.status(202).send('Accepted');
    }

    // Handle the event based on its type. `event.data` is the resource itself
    // (an Order, Subscription, Customer, etc.).
    switch (event.type) {
      case 'checkout.updated':
        console.log('Checkout updated:', event.data.id);
        // TODO: track conversion, react to a confirmed checkout
        break;

      case 'order.created':
        console.log('Order created:', event.data.id);
        // TODO: record the order (check event.data.billing_reason)
        break;

      case 'order.paid':
        console.log('Order paid:', event.data.id);
        // TODO: fulfill the purchase, grant access, send a receipt
        break;

      case 'order.refunded':
        console.log('Order refunded:', event.data.id);
        // TODO: reverse fulfillment, update accounting
        break;

      case 'subscription.created':
        console.log('Subscription created:', event.data.id);
        // TODO: provision access, send a welcome email
        break;

      case 'subscription.canceled':
        console.log('Subscription canceled (cancels at period end):', event.data.id);
        // TODO: schedule retention, mark pending cancellation
        break;

      case 'subscription.revoked':
        console.log('Subscription revoked:', event.data.id);
        // TODO: revoke access to paid features
        break;

      case 'customer.state_changed':
        console.log('Customer state changed:', event.data.id);
        // TODO: sync entitlements from the customer state
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Respond fast (Polar times out at 10s) to acknowledge receipt.
    res.json({ received: true });
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/polar`);
  });
}
