// Generated with: greendot-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const express = require('express');

const app = express();

const TOKEN_SECRET = process.env.GREENDOT_WEBHOOK_TOKEN_SECRET;
const REQUIRED_SCOPE = process.env.GREENDOT_WEBHOOK_SCOPE || 'post:webhook';
const SIGNING_KEY = process.env.GREENDOT_SIGNING_KEY; // optional, program-gated

/**
 * 1) Authenticate the delivery via the OAuth client_credentials Bearer token.
 *
 * Green Dot authenticates itself to your endpoint (push auth). The token is
 * issued by the client_credentials grant with scope `post:webhook`.
 *
 * In production, validate against your authorization server (JWKS / RS256 or
 * token introspection). Here we validate an HS256 token with a shared secret so
 * the example is self-contained and testable.
 */
function verifyToken(authHeader) {
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Missing bearer token');
  const claims = jwt.verify(token, TOKEN_SECRET); // throws on tampering / expiry
  const scopes = String(claims.scope || claims.scp || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!scopes.includes(REQUIRED_SCOPE)) {
    throw new Error('Token missing required scope');
  }
  return claims;
}

/**
 * 2) Optional program-gated payload signature. If GREENDOT_SIGNING_KEY is not
 * configured we rely on the Bearer token alone. When configured, verify the
 * `x-gd-signature` header over the RAW body with a timing-safe comparison.
 *
 * NOTE: The exact algorithm/encoding are not documented publicly — this assumes
 * HMAC-SHA256 hex. Confirm with your Green Dot representative.
 */
function verifySignature(rawBody, signatureHeader) {
  if (!SIGNING_KEY) return true; // not configured → skip
  if (!signatureHeader) return false; // configured but missing → reject
  const expected = crypto
    .createHmac('sha256', SIGNING_KEY)
    .update(rawBody) // raw body, not parsed JSON
    .digest('hex');
  const a = Buffer.from(String(signatureHeader), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false; // timingSafeEqual needs equal lengths
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Build the acknowledgement Green Dot expects: a `responseDetails` body plus the
 * echoed `x-GD-RequestId` header. Omitting either causes Green Dot to retry.
 */
function acknowledge(res, requestId, code = 0) {
  if (requestId) res.set('x-GD-RequestId', requestId);
  return res.status(200).json({
    responseDetails: [{ code, subCode: 0, description: requestId || '' }],
  });
}

/** Dispatch on the `eventType` field of the JSON body. */
function handleEvent(event) {
  switch (event.eventType) {
    case 'transaction':
      console.log(`Transaction event: ${event.eventId}`);
      // TODO: sync ledger, notify the customer, etc.
      break;
    case 'accountUpdated':
      console.log(`Account updated: ${event.eventId}`);
      // TODO: refresh local account record.
      break;
    case 'achTransfer':
      console.log(`ACH transfer event: ${event.eventId}`);
      // TODO: update funding / payout status.
      break;
    case 'cardUpdate':
      console.log(`Card update: ${event.eventId}`);
      // TODO: card lifecycle handling.
      break;
    case 'billPayTransfer':
      console.log(`Bill pay transfer: ${event.eventId}`);
      // TODO: bill pay status / receipts.
      break;
    case 'directDepositSwitch':
      console.log(`Direct deposit switch: ${event.eventId}`);
      // TODO: DD onboarding funnel.
      break;
    case 'provisioning':
      console.log(`Provisioning event: ${event.eventId}`);
      // TODO: onboarding orchestration.
      break;
    default:
      console.log(`Unhandled eventType: ${event.eventType}`);
  }
}

// Capture the RAW body — required for x-gd-signature HMAC verification.
app.post(
  '/webhooks/greendot',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const requestId = req.get('x-GD-RequestId');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    // 1) Authenticate the OAuth Bearer token.
    try {
      verifyToken(req.get('authorization'));
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized', message: err.message });
    }

    // 2) Optional payload signature.
    if (!verifySignature(rawBody, req.get('x-gd-signature'))) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // 3) Parse only AFTER authentication succeeds.
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // 4) Handle the event, then acknowledge.
    try {
      handleEvent(event);
    } catch (err) {
      console.error('Handler error:', err);
      return res.status(500).json({ error: 'Handler error' });
    }

    // 5) Acknowledge: echo x-GD-RequestId + return responseDetails.
    return acknowledge(res, requestId);
  }
);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Listening for Green Dot webhooks on :${PORT}`));
}

module.exports = app;
