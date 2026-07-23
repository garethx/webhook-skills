// Generated with: zendesk-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Zendesk webhook signature.
 *
 * Zendesk signs: base64(HMAC_SHA256(secret, timestamp + rawBody)) — the
 * timestamp is prepended directly to the raw body with no separator.
 *
 * @param {Buffer} rawBody - Raw request body (Buffer from express.raw)
 * @param {string} signature - X-Zendesk-Webhook-Signature header value (base64)
 * @param {string} timestamp - X-Zendesk-Webhook-Signature-Timestamp header value
 * @param {string} secret - The webhook's signing secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyZendeskWebhook(rawBody, signature, timestamp, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp);              // timestamp first...
  hmac.update(rawBody);                // ...then the raw body, no separator
  const expected = hmac.digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;                      // different lengths = invalid
  }
}

// Zendesk webhook endpoint - must use raw body for signature verification
app.post('/webhooks/zendesk',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const signature = req.headers['x-zendesk-webhook-signature'];
    const timestamp = req.headers['x-zendesk-webhook-signature-timestamp'];

    // Both headers are required
    if (!signature || !timestamp) {
      return res.status(400).send('Missing signature headers');
    }

    // Some requests (GET/DELETE) have no body - treat as empty
    const rawBody = req.body && req.body.length ? req.body : Buffer.alloc(0);

    // Verify webhook signature before trusting anything in the payload
    if (!verifyZendeskWebhook(rawBody, signature, timestamp, process.env.ZENDESK_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload after verification. Empty body = no event to dispatch.
    const payload = rawBody.length ? JSON.parse(rawBody.toString()) : {};

    // Event subscriptions carry a CloudEvents-style `type` field.
    // Webhooks connected to a trigger/automation send custom JSON (no `type`).
    const eventType = payload.type;
    console.log(`Received Zendesk webhook: ${eventType || '(custom trigger payload)'}`);

    switch (eventType) {
      case 'zen:event-type:ticket.created':
        console.log('Ticket created:', payload.detail?.id);
        // TODO: Sync ticket to CRM, alert on-call, etc.
        break;

      case 'zen:event-type:ticket.status_changed':
        console.log('Ticket status changed:', payload.detail?.id);
        // TODO: Update dashboards, SLA tracking, etc.
        break;

      case 'zen:event-type:ticket.comment_added':
        console.log('Ticket comment added:', payload.detail?.id);
        // TODO: Mirror comment to chat, notify watchers, etc.
        break;

      case 'zen:event-type:ticket.priority_changed':
        console.log('Ticket priority changed:', payload.detail?.id);
        // TODO: Escalation routing, etc.
        break;

      case 'zen:event-type:ticket.agent_assignment_changed':
        console.log('Ticket assignee changed:', payload.detail?.id);
        // TODO: Notify the newly assigned agent, etc.
        break;

      case 'zen:event-type:user.created':
        console.log('User created:', payload.detail?.id);
        // TODO: Provision account, send welcome flow, etc.
        break;

      case 'zen:event-type:organization.created':
        console.log('Organization created:', payload.detail?.id);
        // TODO: Sync organization to billing/CRM, etc.
        break;

      default:
        // Either an event type you haven't subscribed to handle, or a custom
        // trigger/automation payload without a `type` field.
        console.log('Unhandled Zendesk webhook payload');
    }

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyZendeskWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/zendesk`);
  });
}
