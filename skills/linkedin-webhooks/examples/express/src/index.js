// Generated with: linkedin-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Compute the challengeResponse for LinkedIn endpoint validation (GET).
 * challengeResponse = hex(HMACSHA256(challengeCode, clientSecret))
 */
function challengeResponse(challengeCode, clientSecret) {
  return crypto.createHmac('sha256', clientSecret).update(challengeCode).digest('hex');
}

/**
 * Verify a LinkedIn push-event signature (POST).
 * X-LI-Signature = hex(HMACSHA256("hmacsha256=" + rawBody, clientSecret))
 * The "hmacsha256=" prefix is part of the string-to-sign only, not the header.
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string} signatureHeader - X-LI-Signature header value (bare hex digest)
 * @param {string} clientSecret - App client secret
 * @returns {boolean}
 */
function verifyLinkedInWebhook(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader) {
    return false;
  }

  const stringToSign = Buffer.concat([
    Buffer.from('hmacsha256='),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody),
  ]);

  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(stringToSign)
    .digest('hex');

  // Timing-safe comparison; wrap because it throws on length mismatch.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Classify a LinkedIn notification. LinkedIn sends no event-type header, so the
 * product is derived from the payload. Adapt the field checks to the products
 * your app subscribes to.
 */
function getNotificationType(payload) {
  if (payload.eventType) {
    return payload.eventType;
  }
  if ('leadType' in payload || 'leadAction' in payload || 'leadMetadata' in payload) {
    return 'LEAD_ACTION';
  }
  if ('organizationSocialAction' in payload || 'socialAction' in payload) {
    return 'ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS';
  }
  return 'UNKNOWN';
}

// Dedupe store — notifications may be delivered more than once.
// Replace with Redis/DB in production.
const processedNotifications = new Set();

// GET: LinkedIn endpoint validation. Must respond within 3s as JSON.
app.get('/webhooks/linkedin', (req, res) => {
  const challengeCode = req.query.challengeCode;
  if (!challengeCode) {
    return res.status(400).json({ error: 'Missing challengeCode' });
  }

  res.status(200).json({
    challengeCode,
    challengeResponse: challengeResponse(challengeCode, process.env.LINKEDIN_CLIENT_SECRET),
  });
});

// POST: LinkedIn event delivery. Raw body required for signature verification.
app.post('/webhooks/linkedin',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-li-signature'];

    if (!verifyLinkedInWebhook(req.body, signature, process.env.LINKEDIN_CLIENT_SECRET)) {
      console.error('LinkedIn webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verifying.
    const payload = JSON.parse(req.body.toString());
    const notificationType = getNotificationType(payload);

    // Dedupe on notificationId before processing.
    const notificationId = payload.notificationId;
    if (notificationId && processedNotifications.has(notificationId)) {
      console.log(`Duplicate notification ${notificationId}, skipping`);
      return res.status(200).send('OK');
    }
    if (notificationId) {
      processedNotifications.add(notificationId);
    }

    console.log(`Received ${notificationType} notification (${notificationId})`);

    switch (notificationType) {
      case 'LEAD_ACTION':
        console.log('Lead Sync action:', payload.leadType);
        // TODO: fetch full lead via the Lead Sync pull API, enqueue to CRM, etc.
        break;

      case 'ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS':
        console.log('Org social action on:', payload.organizationSocialAction || payload.object);
        // TODO: moderate comment, notify community manager, etc.
        break;

      default:
        console.log(`Unhandled notification type: ${notificationType}`);
    }

    // Acknowledge with a 2xx so LinkedIn does not retry.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyLinkedInWebhook, challengeResponse, getNotificationType };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/linkedin`);
  });
}
