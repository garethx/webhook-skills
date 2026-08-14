// Generated with: baselinker-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// BaseLinker (Base.com) is NOT a normal webhook source:
//
//   1. Deliveries are HTTP HEAD requests. A HEAD request has NO BODY by
//      definition — never read req.body, and never mount a JSON body parser on
//      this route.
//   2. The entire payload is in the QUERY STRING (req.query). Query values are
//      always STRINGS: coerce numerics explicitly and never assume a param is
//      present. Observed params are `order_id` (e.g. 42) and `state` (e.g.
//      "packed") — observed examples, NOT a documented or exhaustive list.
//   3. There is NO signature verification. No HMAC, no signature header, no
//      timestamp/replay check, no shared secret, no handshake. Do not write a
//      verifier — there is nothing to verify with.
//
// Note: X-BLToken is BaseLinker's REQUEST auth header for YOUR outbound calls to
// api.baselinker.com. It is not a webhook signature and never arrives inbound.

// OPTIONAL and NOT provider authentication: a random token YOU append to the
// endpoint URL you register in BaseLinker's Automatic Actions (?token=...).
// Unset => the check is skipped (and the endpoint is fully unauthenticated).
const URL_TOKEN = process.env.BASELINKER_URL_TOKEN || '';
if (!URL_TOKEN) {
  console.warn(
    'BASELINKER_URL_TOKEN is not set — this endpoint is unauthenticated. ' +
      'BaseLinker provides no signature, so rely on URL secrecy, network controls, ' +
      'or set BASELINKER_URL_TOKEN and append ?token=<value> to the registered URL.'
  );
}

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
 * Check the token YOU appended to the endpoint URL.
 *
 * This is NOT a BaseLinker signature — BaseLinker signs nothing. It is your own
 * secret round-tripped back to you in the query string, so it is visible in the
 * URL and in proxy logs. Returns true when no token is configured.
 *
 * @param {Record<string, unknown>} query - parsed query params (req.query)
 * @param {string} expected - BASELINKER_URL_TOKEN ('' disables the check)
 * @returns {boolean}
 */
function verifyUrlToken(query, expected) {
  if (!expected) return true; // not configured — nothing to check
  const provided = query.token;
  if (typeof provided !== 'string') return false; // absent, or repeated (array)
  return safeEqual(provided, expected);
}

/**
 * Read a BaseLinker delivery out of the query string.
 *
 * Every value arrives as a string (or as an array when a param is repeated), so
 * `order_id` is coerced explicitly and validated. Nothing is assumed present.
 *
 * @param {Record<string, unknown>} query - parsed query params (req.query)
 * @returns {{ orderId: number|null, state: string|null }}
 */
function parseDelivery(query) {
  const rawOrderId = typeof query.order_id === 'string' ? query.order_id : null;
  const rawState = typeof query.state === 'string' ? query.state : null;

  // Query values are ALWAYS strings — coerce, then validate the result.
  const orderId = rawOrderId === null ? NaN : Number(rawOrderId);
  const validOrderId = Number.isInteger(orderId) && orderId > 0;

  return {
    orderId: validOrderId ? orderId : null,
    state: rawState,
  };
}

/**
 * Fetch the authoritative order from the documented BaseLinker API.
 *
 * The HEAD delivery carries no body and no proof of origin, so it tells you THAT
 * something changed, not WHAT — and it should be treated as an untrusted hint.
 * X-BLToken is the request auth header here (outbound only).
 *
 * @param {number} orderId
 * @returns {Promise<object|null>} the API response, or null when unconfigured
 */
async function fetchOrder(orderId) {
  const token = process.env.BASELINKER_API_TOKEN;
  if (!token) return null;

  const response = await fetch('https://api.baselinker.com/connector.php', {
    method: 'POST',
    headers: {
      'X-BLToken': token,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      method: 'getOrders',
      parameters: JSON.stringify({ order_id: orderId }),
    }),
  });

  return response.json();
}

// HEAD, not POST. Express's app.get() would also answer HEAD requests, but
// register app.head() explicitly so the intent is visible and a later app.get()
// refactor cannot change it. No body parser: there is no body to parse.
app.head('/webhooks/baselinker', (req, res) => {
  // Optional URL-token check (see verifyUrlToken — not a provider signature).
  if (!verifyUrlToken(req.query, URL_TOKEN)) {
    console.error('BaseLinker webhook rejected: URL token missing or mismatched');
    return res.sendStatus(401); // bodyless — Express omits the body for HEAD
  }

  const { orderId, state } = parseDelivery(req.query);

  if (orderId === null) {
    // `order_id` was absent, repeated, or not a positive integer. Nothing
    // actionable. (If you would rather never signal failure to an undocumented
    // sender, log and return 200 here instead.)
    console.error('BaseLinker webhook rejected: missing or invalid order_id');
    return res.sendStatus(400);
  }

  // `state` is an opaque string (observed: "packed"). It is NOT an event-type
  // discriminator and NOT a documented enum — don't switch over a fixed list.
  console.log(`BaseLinker change for order ${orderId} (state: ${state ?? 'none'})`);

  // Acknowledge FIRST with a bare, bodyless 200. RFC 9110 section 9.3.2 forbids
  // a body on a HEAD response — never res.json(...) here.
  res.sendStatus(200);

  // Then enrich out-of-band: re-fetch the authoritative order before acting on
  // it. TODO: replace the log with your own processing (dedupe on
  // order_id + state so a redelivery doesn't action the same change twice).
  fetchOrder(orderId)
    .then((order) => {
      if (order) console.log(`Fetched order ${orderId}:`, order.status);
    })
    .catch((err) => console.error(`Failed to fetch order ${orderId}:`, err.message));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = {
  app,
  verifyUrlToken,
  parseDelivery,
  fetchOrder,
};

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: HEAD http://localhost:${PORT}/webhooks/baselinker`);
  });
}
