// Generated with: ethoca-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// Validate required environment variables at startup
const requiredEnvVars = ['ETHOCA_WEBHOOK_USERNAME', 'ETHOCA_WEBHOOK_PASSWORD'];
const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

const app = express();

/**
 * Timing-safe string comparison that tolerates length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify Ethoca webhook HTTP Basic Auth.
 *
 * Ethoca Alerts Push API deliveries have NO HMAC/signature header. Trust comes
 * from mutual TLS (MSSL, Entrust CA) at the transport layer plus these Basic
 * Auth credentials at the application layer.
 *
 * @param {string} authHeader - Authorization header value
 * @param {string} username - Expected username
 * @param {string} password - Expected password
 * @returns {boolean} - Whether the credentials are valid
 */
function verifyEthocaAuth(authHeader, username, password) {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const i = decoded.indexOf(':'); // split on the FIRST colon; passwords may contain ':'
  if (i === -1) return false;
  return (
    safeEqual(decoded.slice(0, i), username) &&
    safeEqual(decoded.slice(i + 1), password)
  );
}

// Normalize alertType to one of the two Ethoca categories. Confirm the literal
// values (historically numeric) against your Ethoca onboarding schema.
function alertCategory(alertType) {
  const map = { fraud: 'fraud', dispute: 'dispute', 1: 'fraud', 2: 'dispute' };
  return map[alertType] || 'unknown';
}

// Ordinary JSON parsing is fine: there is no body signature to protect.
app.post('/webhooks/ethoca', express.json(), (req, res) => {
  const authenticated = verifyEthocaAuth(
    req.headers.authorization,
    process.env.ETHOCA_WEBHOOK_USERNAME,
    process.env.ETHOCA_WEBHOOK_PASSWORD
  );

  if (!authenticated) {
    console.error('Ethoca webhook authentication failed');
    return res.status(401).send('Unauthorized');
  }

  const alert = req.body || {};
  const category = alertCategory(alert.alertType);

  console.log(`Received Ethoca ${alert.alertType} alert (${category}):`, alert.id);

  // Handle the alert based on its category
  switch (category) {
    case 'fraud':
      console.log('Fraud alert:', alert.id, alert.transaction?.arn);
      // TODO: Stop fulfilment, refund, cancel subscription, block the account.
      break;

    case 'dispute':
      console.log('Dispute alert:', alert.id, alert.transaction?.arn);
      // TODO: Refund to prevent a chargeback, gather evidence, update the order.
      break;

    default:
      console.log(`Unhandled alertType: ${alert.alertType}`);
  }

  // TODO: Report the outcome back to Ethoca via the OAuth 1.0a Outcome API.

  // Acknowledge receipt.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = { app, verifyEthocaAuth, alertCategory };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ethoca`);
  });
}
