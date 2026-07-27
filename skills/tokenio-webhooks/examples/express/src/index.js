// Generated with: tokenio-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Token.io webhook.
 *
 * Token.io signs the RAW request body with Ed25519 (asymmetric — NOT HMAC and
 * NOT Standard Webhooks). Two headers arrive with every delivery:
 *
 *   token-signature: Ed25519 signature of the raw body, base64url encoded
 *   token-event:     the event type (e.g. PAYMENT_STATUS_CHANGED)
 *
 * Verify with your member's Ed25519 PUBLIC key (base64url, no padding) from the
 * Token Dashboard → Settings → Member Information. The public key is the `x`
 * value of an OKP/Ed25519 JWK.
 *
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string} signatureHeader - The `token-signature` header value
 * @param {string} publicKeyB64url - Member Ed25519 public key (base64url)
 * @returns {boolean} - Whether the signature is valid
 */
function verifyTokenWebhook(rawBody, signatureHeader, publicKeyB64url) {
  if (!signatureHeader || !publicKeyB64url) {
    return false;
  }
  try {
    // Import the base64url public key as an Ed25519 JWK.
    const key = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: publicKeyB64url },
      format: 'jwk',
    });
    const message = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(rawBody, 'utf8');
    // Ed25519 → algorithm arg is null. base64url-decode the signature.
    return crypto.verify(
      null,
      message,
      key,
      Buffer.from(signatureHeader, 'base64url')
    );
  } catch {
    // Malformed key or signature = invalid, never a 500.
    return false;
  }
}

// Token.io webhook endpoint — must use the raw body for signature verification.
app.post(
  '/webhooks/tokenio',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const signature = req.get('token-signature');
    const event = req.get('token-event');

    // Verify before parsing. Fail closed on a missing/invalid signature.
    if (!verifyTokenWebhook(req.body, signature, process.env.TOKEN_WEBHOOK_PUBLIC_KEY)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Safe to parse now that the signature checks out.
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The event type is in the `token-event` header, not the body.
    console.log(`Received Token.io event: ${event}`);

    switch (event) {
      case 'PAYMENT_STATUS_CHANGED': {
        const payment = payload.payment || {};
        // Drive logic off the normalized `status`; keep `bankPaymentStatus`
        // (raw ISO 20022) for audit/debugging.
        console.log(
          `Payment ${payment.id} → ${payment.status} (bank: ${payment.bankPaymentStatus})`
        );
        switch (payment.status) {
          case 'INITIATION_PROCESSING':
            // TODO: mark payment as processing
            break;
          case 'INITIATION_COMPLETED':
            // TODO: mark payment accepted by the bank
            break;
          case 'INITIATION_REJECTED':
            // TODO: mark payment rejected, notify the customer
            break;
          case 'SUCCESS':
            // TODO: funds confirmed — fulfil the order
            break;
          default:
            console.log(`Unhandled payment status: ${payment.status}`);
        }
        break;
      }

      case 'TRANSFER_STATUS_CHANGED':
        // TODO: Payments v1 transfer status change
        break;

      case 'REFUND_STATUS_CHANGED':
        // TODO: reconcile refund status
        break;

      case 'VRP_STATUS_CHANGED':
        // TODO: Variable Recurring Payment status change
        break;

      case 'VRP_CONSENT_STATUS_CHANGED':
        // TODO: VRP consent / mandate lifecycle
        break;

      case 'VIRTUAL_ACCOUNT_CREDIT_RECEIVED':
        // TODO: reconcile inbound funds on a virtual account
        break;

      case 'PAYOUT_STATUS_CHANGED':
        // TODO: settlement / payout tracking
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Acknowledge quickly so Token.io does not retry.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyTokenWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tokenio`);
  });
}
