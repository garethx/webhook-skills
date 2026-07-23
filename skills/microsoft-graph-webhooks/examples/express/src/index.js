// Generated with: microsoft-graph-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the clientState echoed on a Microsoft Graph notification.
 *
 * Graph does NOT sign notifications with an HMAC. Instead, the opaque
 * `clientState` you set when creating the subscription is echoed on every
 * notification. Compare it (timing-safe, length-checked) to your stored secret.
 *
 * @param {string} received - clientState from the notification item
 * @param {string} expected - your stored MICROSOFT_GRAPH_CLIENT_STATE
 * @returns {boolean}
 */
function verifyClientState(received, expected) {
  if (!received || !expected) {
    return false;
  }
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // crypto.timingSafeEqual throws on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// Microsoft Graph notifications are application/json. The endpoint validation
// handshake carries no body (the token is in the query string), so express.json()
// leaving req.body empty for it is fine.
app.post('/webhooks/microsoft-graph', express.json(), (req, res) => {
  // 1) Endpoint validation handshake.
  //    On subscription create/renewal Graph sends ?validationToken=... and
  //    expects the URL-decoded token echoed back as text/plain, 200, within 10s.
  //    Express already URL-decodes req.query values.
  const validationToken = req.query.validationToken;
  if (validationToken) {
    return res.status(200).type('text/plain').send(String(validationToken));
  }

  // 2) Ordinary notification batch under `value`.
  const notifications = Array.isArray(req.body?.value) ? req.body.value : [];
  const expected = process.env.MICROSOFT_GRAPH_CLIENT_STATE;

  // Validate clientState on every item before processing any of them.
  for (const notification of notifications) {
    if (!verifyClientState(notification.clientState, expected)) {
      console.error('clientState mismatch — rejecting notification batch');
      return res.status(400).send('Invalid clientState');
    }
  }

  for (const notification of notifications) {
    if (notification.lifecycleEvent) {
      handleLifecycleEvent(notification);
    } else {
      handleChangeNotification(notification);
    }
  }

  // Acknowledge within 3 seconds. Return 202 and do heavy work asynchronously.
  return res.status(202).send();
});

/**
 * Handle a change notification (created / updated / deleted).
 */
function handleChangeNotification(notification) {
  const { changeType, resource, subscriptionId } = notification;
  const resourceId = notification.resourceData?.id;

  console.log(`Received ${changeType} for ${resource} (subscription: ${subscriptionId})`);

  switch (changeType) {
    case 'created':
      console.log(`Resource created: ${resourceId}`);
      // TODO: Fetch the full resource from Graph, or use rich notifications
      break;

    case 'updated':
      console.log(`Resource updated: ${resourceId}`);
      // TODO: Re-fetch and reconcile
      break;

    case 'deleted':
      console.log(`Resource deleted: ${resourceId}`);
      // TODO: Remove local copy
      break;

    default:
      console.log(`Unhandled changeType: ${changeType}`);
  }
}

/**
 * Handle a lifecycle notification (delivered to lifecycleNotificationUrl).
 */
function handleLifecycleEvent(notification) {
  const { lifecycleEvent, subscriptionId } = notification;

  console.log(`Lifecycle event ${lifecycleEvent} for subscription ${subscriptionId}`);

  switch (lifecycleEvent) {
    case 'reauthorizationRequired':
      console.log('Reauthorize/renew the subscription (POST /reauthorize or PATCH expirationDateTime)');
      // TODO: Reauthorize and/or renew the subscription
      break;

    case 'subscriptionRemoved':
      console.log('Subscription removed — recreate it and resync via delta query');
      // TODO: Recreate subscription, then delta-sync missed changes
      break;

    case 'missed':
      console.log('Missed notifications — resync via delta query');
      // TODO: Delta-sync to recover missed changes
      break;

    default:
      console.log(`Unhandled lifecycleEvent: ${lifecycleEvent}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyClientState };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/microsoft-graph`);
  });
}
