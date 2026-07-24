// Generated with: alipay-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const { ACK_BODY, verifyAlipaySignature, signAlipayResponse } = require('./verify');

const app = express();

const CLIENT_ID = process.env.ALIPAY_CLIENT_ID;
const ALIPAY_PUBLIC_KEY = process.env.ALIPAY_PUBLIC_KEY; // Antom/Alipay+ public key — verifies inbound
const MERCHANT_PRIVATE_KEY = process.env.ALIPAY_MERCHANT_PRIVATE_KEY; // your key — signs the ack
const KEY_VERSION = process.env.ALIPAY_KEY_VERSION || 1;

const WEBHOOK_PATH = '/webhooks/alipay';

// Send the signed SUCCESS acknowledgement. Antom verifies THIS response, so it
// must be signed with your merchant private key over the same two-line content.
function sendSignedAck(req, res) {
  const responseTime = new Date().toISOString();
  const signature = signAlipayResponse({
    method: req.method, // "POST"
    uri: req.originalUrl, // the path Antom POSTed to, e.g. /webhooks/alipay
    clientId: CLIENT_ID,
    responseTime,
    body: ACK_BODY,
    privateKey: MERCHANT_PRIVATE_KEY,
    keyVersion: KEY_VERSION,
  });

  res
    .status(200)
    .set('Client-Id', CLIENT_ID)
    .set('Response-Time', responseTime)
    .set('Signature', signature)
    .type('application/json')
    .send(ACK_BODY);
}

// CRITICAL: express.raw() — the signature covers the exact raw bytes, so the
// body must NOT be parsed to JSON before verification.
app.post(WEBHOOK_PATH, express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = req.body.toString('utf8');
  const clientId = req.get('Client-Id');
  const requestTime = req.get('Request-Time');
  const signatureHeader = req.get('Signature');

  if (!signatureHeader || !clientId || !requestTime) {
    return res.status(400).send('Missing Alipay signature headers');
  }

  const valid = verifyAlipaySignature({
    method: req.method,
    uri: req.originalUrl,
    clientId,
    requestTime,
    rawBody,
    signatureHeader,
    publicKey: ALIPAY_PUBLIC_KEY,
  });

  if (!valid) {
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Notifications branch on `notifyType` (there is no `type` field). Use
  // `result.resultStatus` for the outcome: S=success, F=failure, U=pending.
  const status = event.result && event.result.resultStatus;

  switch (event.notifyType) {
    case 'PAYMENT_RESULT':
      // Reconcile on paymentRequestId (your idempotency key). Only treat S as paid.
      console.log('Payment result:', event.paymentRequestId, event.paymentId, status);
      // TODO: if (status === 'S') fulfill the order
      break;
    case 'CAPTURE_RESULT':
      console.log('Capture result:', event.captureRequestId, event.captureId, status);
      // TODO: settle funds / reconcile the capture
      break;
    case 'REFUND_RESULT':
      console.log('Refund result:', event.refundRequestId, event.refundId, status);
      // TODO: update the refund record, notify the customer
      break;
    case 'AUTHORIZATION_RESULT':
      console.log('Authorization result:', event.authorizationRequestId, status);
      // TODO: enable / cancel the agreement (Auto Debit)
      break;
    case 'DISPUTE_CREATED':
    case 'DISPUTE_JUDGED':
      console.log('Dispute:', event.notifyType, event.disputeId, status);
      // TODO: alert risk/ops, gather evidence, record the judgement
      break;
    default:
      console.log('Unhandled notifyType:', event.notifyType);
  }

  // Acknowledge with a signed 200 so Antom stops retrying.
  return sendSignedAck(req, res);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}${WEBHOOK_PATH}`);
  });
}
