// Generated with: upollo-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Parse an Upollo-Signature header into its parts.
 *
 * Format: "t:<unix_ts>,s0:<hmac-sha512>" -> { t, s0 }
 */
function parseUpolloSignature(header) {
  return Object.fromEntries(
    header.split(',').map((part) => {
      const i = part.indexOf(':');
      return [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    })
  );
}

/**
 * Verify an Upollo webhook signature.
 *
 * Upollo computes HMAC-SHA512(webhook_secret, raw_body) and sends it as the
 * `s0` part of the `Upollo-Signature` header. Verify against the RAW body.
 *
 * Upollo's docs do not state whether `s0` is hex- or base64-encoded (the `s0:`
 * prefix and 128-char values indicate hex), so we compute the digest once and
 * compare against both. Confirm hex against a real delivery, then drop base64.
 *
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string} signatureHeader - Upollo-Signature header value
 * @param {string} secret - Webhook secret from Access & Keys -> Webhooks
 * @returns {boolean} Whether the signature is valid
 */
function verifyUpolloWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  const { s0 } = parseUpolloSignature(signatureHeader);
  if (!s0) {
    return false;
  }

  const digest = crypto.createHmac('sha512', secret).update(rawBody).digest();

  // Accept hex or base64 (encoding unspecified) — timing-safe either way.
  return [digest.toString('hex'), digest.toString('base64')].some((expected) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(s0), Buffer.from(expected));
    } catch {
      return false; // length mismatch → not a match
    }
  });
}

/**
 * Strip Upollo's enum prefixes so short-form ("CHALLENGE") and prefixed
 * ("OUTCOME_CHALLENGE") values both match.
 */
function normalizeEnum(value) {
  return String(value || '').replace(/^(OUTCOME_|EVENT_TYPE_|FLAG_TYPE_)/, '');
}

// Upollo webhook endpoint - must use the raw body for signature verification.
app.post('/webhooks/upollo', express.raw({ type: '*/*' }), async (req, res) => {
  const signature = req.headers['upollo-signature'];

  if (!verifyUpolloWebhook(req.body, signature, process.env.UPOLLO_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse the payload only after verification.
  const payload = JSON.parse(req.body.toString());

  // Upollo may deliver the analysis flat or wrapped under `analysis` — support both.
  const analysis = payload.analysis || payload;
  const action = normalizeEnum(analysis.action);
  const eventType = normalizeEnum(analysis.eventType);
  const flags = analysis.flags || [];
  const user = analysis.userInfo || analysis.user || {};
  const device = analysis.deviceInfo || analysis.device || {};

  console.log(
    `Upollo flagged user ${user.userId || 'unknown'} on ${eventType || 'UNKNOWN'} ` +
      `-> action ${action || 'NONE'} (${flags.length} flag(s))`
  );

  // Handle each flag that was raised.
  for (const flag of flags) {
    const type = normalizeEnum(flag.type);
    switch (type) {
      case 'ACCOUNT_SHARING':
      case 'ACCOUNT_SHARING_SAME_HOUSEHOLD':
        console.log(`Account sharing detected for ${user.userId}`);
        // TODO: prompt to add seats / limit concurrent sessions
        break;

      case 'MULTIPLE_ACCOUNTS':
        console.log(`Multiple accounts detected for ${user.userId}`);
        // TODO: link/merge accounts or block trial abuse
        break;

      case 'REPEATED_SIGNUP':
      case 'TRIALED_ON_OTHER_ACCOUNT':
      case 'REPEATED_REDEMPTION':
        console.log(`Trial/offer abuse (${type}) for ${user.userId}`);
        // TODO: deny the offer / trial
        break;

      case 'SUSPECTED_ACCOUNT_COMPROMISE':
      case 'CREDENTIAL_STUFFING':
        console.log(`Possible account takeover (${type}) for ${user.userId}`);
        // TODO: force a password reset / step-up auth
        break;

      default:
        console.log(`Flag ${type} for ${user.userId} (device ${device.deviceId || 'n/a'})`);
    }
  }

  // Act on Upollo's recommended action.
  switch (action) {
    case 'CHALLENGE':
      console.log('Recommended: challenge the user (step-up verification)');
      // TODO: trigger MFA / email / SMS challenge
      break;

    case 'DENY':
      console.log('Recommended: deny the action');
      // TODO: reject the login / purchase
      break;

    case 'OFFER':
      console.log('Recommended: present an offer');
      // TODO: show upsell (e.g. add seats)
      break;

    case 'LOG':
      console.log('Recommended: log only');
      break;

    case 'PERMIT':
      console.log('Recommended: permit the user');
      break;

    default:
      console.log(`Unhandled action: ${action}`);
  }

  // Respond quickly (2xx) to acknowledge; defer heavy work.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyUpolloWebhook, parseUpolloSignature, normalizeEnum };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/upollo`);
  });
}
