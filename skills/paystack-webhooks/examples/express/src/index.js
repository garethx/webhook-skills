// Generated with: paystack-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Paystack webhook signature.
 *
 * Paystack signs the RAW request body with HMAC-SHA512 (hex) using your secret
 * key and sends it in the `x-paystack-signature` header. The official SDKs have
 * no verification helper, so we recompute the HMAC and compare it in constant
 * time.
 *
 * @param {Buffer|string} rawBody - Raw request body (NOT parsed JSON)
 * @param {string} signature - Value of the x-paystack-signature header
 * @param {string} secret - Paystack secret key (sk_test_… / sk_live_…)
 * @returns {boolean} Whether the signature is valid
 */
function verifyPaystackWebhook(rawBody, signature, secret) {
  if (!signature) {
    return false;
  }
  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody) // raw bytes/string, NOT parsed JSON
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Different lengths throw — treat as invalid.
    return false;
  }
}

// Paystack webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/paystack',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-paystack-signature'];

    // Verify webhook signature BEFORE parsing the body
    if (!verifyPaystackWebhook(req.body, signature, process.env.PAYSTACK_SECRET_KEY)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification succeeds
    const payload = JSON.parse(req.body.toString());
    const { event, data } = payload;

    console.log(`Received ${event} event`);

    // Acknowledge immediately (respond 200 fast), then process asynchronously.
    // Paystack's request timeout is 30s and any non-200 triggers retries.
    res.status(200).send('OK');

    // The event type is in the body's `event` field, not a header.
    switch (event) {
      case 'charge.success':
        console.log(`Charge succeeded: ${data.reference} (${data.amount} ${data.currency})`);
        // TODO: Re-verify via GET /transaction/verify/:reference, then fulfil.
        break;

      case 'transfer.success':
        console.log(`Transfer succeeded: ${data.reference} (${data.transfer_code})`);
        // TODO: Mark the payout complete, notify the recipient.
        break;

      case 'transfer.failed':
        console.log(`Transfer failed: ${data.reference} (${data.transfer_code})`);
        // TODO: Alert ops, retry the payout, re-credit the balance.
        break;

      case 'transfer.reversed':
        console.log(`Transfer reversed: ${data.reference} (${data.transfer_code})`);
        // TODO: Reconcile the ledger.
        break;

      case 'refund.processed':
        console.log(`Refund processed for transaction: ${data.transaction_reference}`);
        // TODO: Update your ledger, notify the customer.
        break;

      case 'subscription.create':
        console.log(`Subscription created: ${data.subscription_code}`);
        // TODO: Provision the plan, start the billing cycle.
        break;

      case 'subscription.disable':
        console.log(`Subscription disabled: ${data.subscription_code}`);
        // TODO: Revoke access, offboard the customer.
        break;

      case 'invoice.create':
        console.log(`Invoice created: ${data.invoice_code}`);
        // TODO: Notify the customer of the upcoming charge.
        break;

      case 'invoice.update':
        console.log(`Invoice updated: ${data.invoice_code} (paid: ${data.paid})`);
        // TODO: Reconcile the charge result.
        break;

      case 'invoice.payment_failed':
        console.log(`Invoice payment failed: ${data.invoice_code}`);
        // TODO: Start dunning, retry, notify the customer.
        break;

      case 'charge.dispute.create':
        console.log(`Dispute opened: ${data.id}`);
        // TODO: Gather evidence and respond to the dispute.
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyPaystackWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paystack`);
  });
}
