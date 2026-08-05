// Generated with: vapi-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// Vapi's Server URL has no fixed signature scheme. The recommended, fully
// specified auth is a SHARED SECRET carried in a header: `Authorization: Bearer
// <token>` (Bearer Token credential) or `X-Vapi-Secret: <token>` (legacy
// credential / the old inline server.secret field). It is a literal string
// compare — nothing is hashed. Configure the credential in the Vapi dashboard.
const EXPECTED_SECRET = process.env.VAPI_WEBHOOK_SECRET;
if (!EXPECTED_SECRET) {
  console.warn(
    'VAPI_WEBHOOK_SECRET is not set — every webhook will be rejected with 401. ' +
      'Set it to the shared secret your Vapi Server URL credential sends.'
  );
}

// The four message.type values that REQUIRE a JSON response body — Vapi consumes
// your answer to drive the live call. A bare 200 breaks these.
const REQUEST_RESPONSE_TYPES = [
  'assistant-request',
  'tool-calls',
  'transfer-destination-request',
  'knowledge-base-request',
];

// Informational message.type values — acknowledge with a bare 200 (no body).
const INFORMATIONAL_TYPES = [
  'status-update',
  'end-of-call-report',
  'hang',
  'conversation-update',
  'transcript',
  'speech-update',
  'model-output',
  'transfer-update',
  'user-interrupted',
  'language-change-detected',
  'phone-call-control',
  'chat.created',
  'chat.deleted',
  'session.created',
  'session.updated',
  'session.deleted',
];

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
 * Read the shared secret from whichever header the Server URL credential is
 * configured to send: `Authorization: Bearer <token>` (strip the prefix) or the
 * legacy `X-Vapi-Secret` header.
 */
function extractToken(headers) {
  const auth = headers['authorization'];
  if (auth) return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  return headers['x-vapi-secret'];
}

/**
 * Verify a Vapi webhook using the shared-secret path.
 *
 * @param {Record<string,string|undefined>} headers - request headers
 * @param {string|undefined} expected - VAPI_WEBHOOK_SECRET
 * @returns {boolean} whether a matching secret was presented
 */
function verifyVapiSecret(headers, expected) {
  const token = extractToken(headers);
  if (!token || !expected) return false;
  return safeEqual(token, expected);
}

// There is no body signature to protect on the shared-secret path (the secret is
// in a header), so ordinary JSON parsing is fine.
app.post('/webhooks/vapi', express.json(), (req, res) => {
  // Authenticate first.
  if (!verifyVapiSecret(req.headers, EXPECTED_SECRET)) {
    console.error('Vapi webhook authentication failed: shared secret mismatch');
    return res.status(401).send('Unauthorized');
  }

  // The event type is NESTED at message.type — not a top-level field.
  const message = (req.body && req.body.message) || {};
  const type = message.type;
  const callId = message.call && message.call.id;
  console.log(`Received Vapi message ${type} (call ${callId})`);

  // --- Request/response types: MUST return a JSON body ---

  if (type === 'assistant-request') {
    // Inbound call to a number with no assistant. Answer within ~7.5s (hard
    // timeout). Return one of: { assistantId }, transient { assistant },
    // { destination } (transfer without an assistant), or { error } to speak.
    return res.json({ assistantId: process.env.VAPI_ASSISTANT_ID || 'YOUR_ASSISTANT_ID' });
  }

  if (type === 'tool-calls') {
    // Run the requested tools and return one result per incoming toolCall.
    const toolCallList = message.toolCallList || [];
    const results = toolCallList.map((tc) => ({
      name: (tc.function && tc.function.name) || tc.name,
      toolCallId: tc.id || tc.toolCallId,
      // TODO: execute the tool and put its return value here.
      result: 'TODO: your tool result',
    }));
    return res.json({ results });
  }

  if (type === 'transfer-destination-request') {
    // Supply the destination for a transferCall that had none.
    return res.json({
      destination: { type: 'number', number: process.env.VAPI_TRANSFER_NUMBER || '+15551234567' },
      message: { type: 'request-start', message: 'Transferring you now.' },
    });
  }

  if (type === 'knowledge-base-request') {
    // Return documents for a custom-knowledge-base provider.
    // TODO: look up relevant documents for message.messages / query.
    return res.json({ documents: [] });
  }

  // --- Informational types: acknowledge with 200, no body required ---

  switch (type) {
    case 'status-update':
      console.log('Call status:', message.status);
      break;

    case 'end-of-call-report':
      // The record to persist: final transcript, recordingUrl, cost, endedReason.
      console.log('End of call:', message.endedReason, 'cost:', message.cost);
      // TODO: store the report / transcript / recording.
      break;

    case 'transcript':
      console.log('Transcript:', message.role, message.transcript);
      break;

    case 'hang':
      console.log('Assistant hung / stalled on call', callId);
      break;

    default:
      if (!INFORMATIONAL_TYPES.includes(type)) {
        // Unknown/new type: acknowledge with 200 so Vapi does not retry.
        console.log(`Unhandled Vapi message type: ${type}`);
      }
  }

  // Informational ack.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = {
  app,
  verifyVapiSecret,
  extractToken,
  REQUEST_RESPONSE_TYPES,
  INFORMATIONAL_TYPES,
};

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/vapi`);
  });
}
