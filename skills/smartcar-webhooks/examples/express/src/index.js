// Generated with: smartcar-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const smartcar = require('smartcar');

const app = express();

// Application Management Token (AMT) — keys the HMAC for both the VERIFY
// challenge and per-payload SC-Signature verification.
const AMT = process.env.SMARTCAR_MANAGEMENT_TOKEN;

// Parse JSON. The Smartcar Node SDK re-serializes the parsed body internally
// when verifying, so the parsed object is what we pass to verifyPayload.
app.post('/webhooks/smartcar', express.json(), (req, res) => {
  const event = req.body;

  // 1. VERIFY handshake — Smartcar sends this once when the webhook is created
  //    or re-verified. Echo back the challenge hashed with the AMT within 15s,
  //    or the webhook never activates. (No SC-Signature check here — a correct
  //    challenge hash proves you hold the AMT.)
  if (event && event.eventType === 'VERIFY') {
    const hmac = smartcar.hashChallenge(AMT, event.data.challenge);
    return res.status(200).json({ challenge: hmac });
  }

  // 2. Verify the SC-Signature header (hex HMAC-SHA256 of the raw body) for all
  //    data events. Reject anything that doesn't verify with 401.
  const signature = req.headers['sc-signature'];
  if (!signature) {
    return res.status(401).send('Missing SC-Signature header');
  }
  if (!smartcar.verifyPayload(AMT, signature, event)) {
    console.error('Smartcar signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // 3. Handle the event. Dedupe on event.eventId (stable across retries);
  //    meta.deliveryId changes per delivery attempt.
  switch (event.eventType) {
    case 'VEHICLE_STATE': {
      const { vehicleId } = event;
      const triggers = (event.data.triggers || []).map((t) => t.name).join(', ');
      console.log(`VEHICLE_STATE for ${vehicleId} — triggered by: ${triggers}`);
      // TODO: persist event.data.signals, update dashboards, fire alerts, etc.
      break;
    }

    case 'VEHICLE_ERROR': {
      const { vehicleId } = event;
      for (const err of event.data.errors || []) {
        console.log(`VEHICLE_ERROR for ${vehicleId}: ${err.code} (${err.state})`);
      }
      // TODO: surface connection issues; clear them when a follow-up event
      //       arrives with errors[].state === 'RESOLVED'.
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.eventType}`);
  }

  // Acknowledge quickly (respond within 15s). Do heavy work asynchronously.
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/smartcar`);
  });
}
