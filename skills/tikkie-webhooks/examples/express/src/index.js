// Generated with: tikkie-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// Tikkie API v2 (ABN AMRO) notifications carry NO SIGNATURE.
//
// The official OpenAPI spec (TikkieAPI_v2.3.yaml) defines only a JSON request
// body and a 2XX acknowledgement for the notification callbacks: no signature
// header, no shared secret, no HMAC, no timestamp header. Do not write an HMAC
// verifier — there is nothing to verify with. Instead this handler:
//
//   1. Checks `subscriptionId` against the id(s) returned (201) when you created
//      the subscription(s). Weak: the id is not a secret-grade credential.
//   2. Treats the notification as a trigger only. It carries tokens, never
//      amounts or status, so we re-fetch the authoritative record from the
//      Tikkie API (API-Key + X-App-Token). A forged notification with made-up
//      tokens just 404s.
//
// Because nothing is signed, there is no need to keep the raw body — the
// standard express.json() parser is fine here.

const NOTIFICATION_TYPES = ['PAYMENT', 'REFUND', 'BUNDLE'];

const REQUIRED_FIELDS = {
  PAYMENT: ['paymentRequestToken', 'paymentToken'],
  REFUND: ['paymentRequestToken', 'paymentToken', 'refundToken'],
  BUNDLE: ['bundleId'],
};

const DEFAULT_API_BASE_URL = 'https://api-sandbox.abnamro.com/v2/tikkie';

/**
 * Subscription ids this endpoint accepts. The payment-request subscription and
 * the transactions subscription each return their OWN subscriptionId, so list
 * both (comma-separated) if they point at the same URL.
 * @returns {string[]}
 */
function getAllowedSubscriptionIds() {
  return (process.env.TIKKIE_SUBSCRIPTION_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

if (getAllowedSubscriptionIds().length === 0) {
  console.warn(
    'TIKKIE_SUBSCRIPTION_ID is not set — the subscriptionId check is SKIPPED. ' +
      'Store the subscriptionId returned when you POST /paymentrequestssubscription ' +
      '(and/or /transactionssubscription) and set it here.'
  );
}

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Check the notification's subscriptionId against the configured id(s).
 * Returns true when nothing is configured (check skipped, warning logged above).
 * This is NOT cryptographic authentication — Tikkie signs nothing.
 *
 * @param {string} subscriptionId
 * @param {string[]} allowed
 * @returns {boolean}
 */
function checkSubscriptionId(subscriptionId, allowed = getAllowedSubscriptionIds()) {
  if (allowed.length === 0) return true;
  return allowed.some((id) => safeEqual(subscriptionId, id));
}

/**
 * Validate the shape of a Tikkie notification. Discriminator is the
 * `notificationType` body field (there is no event-type header).
 *
 * @param {unknown} body
 * @returns {{ ok: true, notification: object, known: boolean } | { ok: false, error: string }}
 */
function parseNotification(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  const { subscriptionId, notificationType } = body;
  if (typeof subscriptionId !== 'string' || !subscriptionId) {
    return { ok: false, error: 'Missing subscriptionId' };
  }
  if (typeof notificationType !== 'string' || !notificationType) {
    return { ok: false, error: 'Missing notificationType' };
  }
  const required = REQUIRED_FIELDS[notificationType];
  if (!required) {
    // Unknown type: accept gracefully so future types don't cause retries.
    return { ok: true, notification: body, known: false };
  }
  for (const field of required) {
    if (typeof body[field] !== 'string' || !body[field]) {
      return { ok: false, error: `Missing ${field} for ${notificationType}` };
    }
  }
  return { ok: true, notification: body, known: true };
}

/**
 * The Tikkie API path holding the authoritative record for a notification.
 * @param {object} n - a validated PAYMENT | REFUND | BUNDLE notification
 * @returns {string}
 */
function recordPath(n) {
  const e = encodeURIComponent;
  switch (n.notificationType) {
    case 'PAYMENT':
      return `/paymentrequests/${e(n.paymentRequestToken)}/payments/${e(n.paymentToken)}`;
    case 'REFUND':
      return `/paymentrequests/${e(n.paymentRequestToken)}/payments/${e(n.paymentToken)}/refunds/${e(n.refundToken)}`;
    case 'BUNDLE':
      return `/transactionbundles/${e(n.bundleId)}`;
    default:
      throw new Error(`No record path for ${n.notificationType}`);
  }
}

/**
 * Re-fetch the authoritative record from the Tikkie API.
 *
 * Returns `undefined` when credentials are not configured (re-fetch skipped),
 * `null` when Tikkie says 404 (unknown tokens — likely a forged notification),
 * or the parsed record. Throws on other failures so the caller can return 5xx
 * and let Tikkie retry.
 *
 * @param {object} notification
 * @returns {Promise<object|null|undefined>}
 */
async function fetchRecord(notification) {
  const apiKey = process.env.TIKKIE_API_KEY;
  const appToken = process.env.TIKKIE_APP_TOKEN;
  if (!apiKey || !appToken) return undefined;

  const baseUrl = (process.env.TIKKIE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const res = await fetch(`${baseUrl}${recordPath(notification)}`, {
    headers: {
      'API-Key': apiKey,
      'X-App-Token': appToken,
      Accept: 'application/json',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Tikkie API returned ${res.status}`);
  return res.json();
}

const app = express();

app.post('/webhooks/tikkie', express.json(), async (req, res) => {
  const parsed = parseNotification(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const notification = parsed.notification;

  // 1. subscriptionId check (weak, but cheap).
  if (!checkSubscriptionId(notification.subscriptionId)) {
    console.warn(`Rejected notification with unknown subscriptionId ${notification.subscriptionId}`);
    return res.status(403).json({ error: 'Unknown subscriptionId' });
  }

  if (!parsed.known) {
    console.log(`Ignoring unknown notificationType: ${notification.notificationType}`);
    return res.status(200).json({ received: true });
  }

  // 2. Re-fetch the authoritative record. The notification has no amount or
  //    status — never fulfil anything from the notification body alone.
  let record;
  try {
    record = await fetchRecord(notification);
  } catch (err) {
    console.error('Failed to fetch record from Tikkie API:', err.message);
    return res.status(502).json({ error: 'Could not confirm notification' });
  }
  if (record === null) {
    return res.status(403).json({ error: 'Notification could not be confirmed' });
  }
  if (record === undefined) {
    console.warn('TIKKIE_API_KEY / TIKKIE_APP_TOKEN not set — skipping re-fetch (do not fulfil in production)');
  }

  // 3. Handle. Tikkie retries (up to three attempts), so make this idempotent:
  //    dedupe on paymentToken (PAYMENT), refundToken (REFUND) or bundleId (BUNDLE).
  switch (notification.notificationType) {
    case 'PAYMENT':
      console.log(
        `Payment ${notification.paymentToken} on request ${notification.paymentRequestToken}`,
        record ? `amountInCents=${record.amountInCents} from ${record.counterPartyName}` : ''
      );
      // TODO: mark the order paid using record.amountInCents
      break;
    case 'REFUND':
      console.log(
        `Refund ${notification.refundToken} for payment ${notification.paymentToken}`,
        record ? `status=${record.status} amountInCents=${record.amountInCents}` : ''
      );
      // TODO: record the refund (record.status is PENDING | PAID)
      break;
    case 'BUNDLE':
      console.log(`Transaction bundle ${notification.bundleId} available`);
      // TODO: download / reconcile the bundled payout
      break;
  }

  res.status(200).json({ received: true });
});

// Malformed JSON from express.json() -> 400
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  next(err);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = {
  app,
  NOTIFICATION_TYPES,
  parseNotification,
  checkSubscriptionId,
  recordPath,
  fetchRecord,
};

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tikkie`);
  });
}
