// Generated with: volume-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * VOLUME WEBHOOK VERIFICATION
 *
 *   header    : Authorization: SHA256withRSA <base64 signature>
 *   algorithm : RSA PKCS#1 v1.5 with SHA-256 (Java "SHA256withRSA"). NOT PSS,
 *               NOT HMAC — there is no shared secret.
 *   signed    : the RAW request body bytes, nothing else (no timestamp, no id)
 *   key       : Volume's RSA-2048 public key, served as bare base64 SPKI
 *               (no BEGIN/END lines) from an environment-specific URL
 *   method    : Volume delivers with HTTP PUT
 */
const PEM_URLS = {
  sandbox: 'https://api.sandbox.volumepay.io/.well-known/signature/pem',
  live: 'https://api.volumepay.io/.well-known/signature/pem',
};
const KEY_CACHE_TTL_MS = 60 * 60 * 1000; // re-fetch the public key hourly

let keyCache = null; // { source, key, expiresAt }

/**
 * Turn either a PEM string or Volume's bare base64 SPKI body into a KeyObject.
 */
function parsePublicKey(value) {
  const text = value.trim();
  if (text.includes('-----BEGIN')) {
    return crypto.createPublicKey(text.replace(/\\n/g, '\n'));
  }
  return crypto.createPublicKey({
    key: Buffer.from(text.replace(/\s+/g, ''), 'base64'),
    format: 'der',
    type: 'spki',
  });
}

function pemUrl() {
  if (process.env.VOLUME_PEM_URL) return process.env.VOLUME_PEM_URL;
  const env = (process.env.VOLUME_ENV || 'sandbox').toLowerCase();
  const url = PEM_URLS[env];
  if (!url) throw new Error(`VOLUME_ENV must be "sandbox" or "live", got "${env}"`);
  return url;
}

/**
 * Resolve Volume's public key. VOLUME_PUBLIC_KEY (literal key) wins; otherwise
 * fetch from VOLUME_PEM_URL / the VOLUME_ENV URL and cache it. Throws if the
 * key cannot be obtained — callers must treat that as a rejection.
 */
async function getVolumePublicKey() {
  if (process.env.VOLUME_PUBLIC_KEY) {
    return parsePublicKey(process.env.VOLUME_PUBLIC_KEY);
  }

  const url = pemUrl();
  if (keyCache && keyCache.source === url && keyCache.expiresAt > Date.now()) {
    return keyCache.key;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetching Volume public key failed: HTTP ${res.status}`);
  const key = parsePublicKey(await res.text());
  keyCache = { source: url, key, expiresAt: Date.now() + KEY_CACHE_TTL_MS };
  return key;
}

function clearKeyCache() {
  keyCache = null;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Verify a Volume webhook. Returns true only for a valid SHA256withRSA
 * signature over the exact raw body.
 *
 * @param {Buffer} rawBody unparsed request body
 * @param {string|undefined} authorization the Authorization header
 * @param {crypto.KeyObject} publicKey Volume's public key
 */
function verifyVolumeSignature(rawBody, authorization, publicKey) {
  if (!authorization || !publicKey) return false;

  // "SHA256withRSA <signature>": scheme token, then the standard-base64 signature.
  const [scheme, signature, ...rest] = authorization.trim().split(/\s+/);
  if (scheme !== 'SHA256withRSA' || !signature || rest.length > 0) return false;
  if (!BASE64.test(signature)) return false; // rejects base64url / stray chars

  try {
    return crypto.verify(
      'sha256', // PKCS#1 v1.5 padding is Node's default for RSA keys
      rawBody,
      publicKey,
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

// --- Idempotency -----------------------------------------------------------
// Volume retries until it gets a 200, and one payment can produce COMPLETED and
// later SETTLED, so dedupe on paymentId + paymentStatus. Use a database or
// Redis in production.
const processed = new Set();

// --- Reconciliation --------------------------------------------------------
// Volume's docs: verify amount, currency and merchantPaymentId against the
// payment record YOU created, and stop processing on any mismatch.
// Replace this in-memory map with your payments table, keyed by paymentId.
const payments = new Map(); // paymentId -> { merchantPaymentId, amountMinor, currency }

/**
 * Compare the webhook against your own payment record.
 * Returns a list of mismatch descriptions (empty = OK).
 * `amount` is in MAJOR units (24.23 = £24.23), so convert before comparing.
 */
function reconcile(payload, record) {
  if (!record) return ['no matching payment record'];
  const problems = [];
  const amountMinor = Math.round(Number(payload.paymentRequest?.amount) * 100);
  if (amountMinor !== record.amountMinor) problems.push('amount mismatch');
  if (payload.paymentRequest?.currency !== record.currency) problems.push('currency mismatch');
  if (
    record.merchantPaymentId !== undefined &&
    payload.merchantPaymentId !== record.merchantPaymentId
  ) {
    problems.push('merchantPaymentId mismatch');
  }
  return problems;
}

function handlePayment(payload) {
  switch (payload.paymentStatus) {
    case 'COMPLETED':
      // Payment succeeded — fulfil the order and notify the customer.
      console.log(`Payment ${payload.paymentId} COMPLETED`);
      break;
    case 'SETTLED':
      // Virtual accounts only: funds settled. Internal/operational use —
      // notify customers on COMPLETED, not on SETTLED.
      console.log(`Payment ${payload.paymentId} SETTLED`);
      break;
    case 'FAILED':
      console.log(`Payment ${payload.paymentId} FAILED: ${payload.errorDescription}`);
      break;
    default:
      console.log(`Unhandled paymentStatus: ${payload.paymentStatus}`);
  }
}

// Raw body is required: re-serialising parsed JSON changes the bytes and the
// RSA signature no longer matches. Volume sends PUT; POST is accepted too.
async function volumeWebhook(req, res) {
  let publicKey;
  try {
    publicKey = await getVolumePublicKey();
  } catch (err) {
    // Fail closed. A non-200 makes Volume retry later.
    console.error('Volume public key unavailable:', err.message);
    return res.status(503).json({ error: 'Signature key unavailable' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyVolumeSignature(rawBody, req.get('authorization'), publicKey)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const dedupeKey = `${payload.paymentId}:${payload.paymentStatus}`;
  if (processed.has(dedupeKey)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  const problems = reconcile(payload, payments.get(payload.paymentId));
  if (problems.length > 0) {
    // Authentic, but it does not match what we expect — do not fulfil.
    // Acknowledge so Volume stops retrying, and alert a human.
    console.warn(`Volume payment ${payload.paymentId} not processed: ${problems.join(', ')}`);
    return res.status(200).json({ received: true, processed: false });
  }

  processed.add(dedupeKey);
  handlePayment(payload);
  return res.status(200).json({ received: true, processed: true });
}

const rawJson = express.raw({ type: '*/*' });
app.put('/webhooks/volume', rawJson, volumeWebhook);
app.post('/webhooks/volume', rawJson, volumeWebhook);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Volume webhook endpoint: PUT http://localhost:${PORT}/webhooks/volume`);
  });
}

module.exports = {
  app,
  verifyVolumeSignature,
  getVolumePublicKey,
  parsePublicKey,
  clearKeyCache,
  reconcile,
  payments,
  processed,
};
