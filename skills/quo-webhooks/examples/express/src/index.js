// Generated with: quo-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Replay window for BOTH schemes. Quo's own signature-validation example uses
// 5 minutes for the current scheme; the same window is reasonable for legacy.
const MAX_AGE_SECONDS = Number(process.env.QUO_MAX_AGE_SECONDS || 300);

/**
 * QUO HAS TWO WEBHOOK GENERATIONS WITH TWO DIFFERENT SIGNATURE SCHEMES.
 *
 * Which one an endpoint receives is decided by how the subscription was
 * created, not by anything configured here — so a handler that may receive
 * both must implement both. They are NOT interchangeable: different headers,
 * different signed content, different timestamp units, different separators.
 *
 *   Scheme A (current, Quo-Api-Version: 2026-03-30)
 *     headers : webhook-id / webhook-timestamp / webhook-signature
 *     signs   : {webhook-id}.{webhook-timestamp}.{raw-body}
 *     ts unit : UNIX SECONDS
 *     secret  : whsec_<base64>  -> strip prefix, then base64-decode
 *
 *   Scheme B (legacy v1, the OpenPhone-era scheme)
 *     header  : openphone-signature  (NOT renamed in the Quo rebrand)
 *     format  : hmac;1;<timestamp>;<base64sig>
 *     signs   : {timestamp}.{raw-body}
 *     ts unit : UNIX MILLISECONDS (inferred from the documented example)
 *     secret  : bare base64        -> base64-decode
 *
 * Both are HMAC-SHA256 with a STANDARD base64 digest (not base64url, not hex),
 * and both sign the RAW, UNPARSED request body bytes.
 *
 * Quo publishes no SDK. Its docs recommend Svix for Scheme A and Svix does work
 * there unchanged — but Svix cannot verify Scheme B at all. Since the legacy
 * path has to be hand-written regardless, this example uses one manual crypto
 * path for both: no dependency, and the algorithm stays visible.
 */

/**
 * Verify a Scheme A (current) Quo delivery.
 *
 * @param {Buffer|string} rawBody  RAW, unparsed request body
 * @param {object} headers         Lowercased request headers
 * @param {string|undefined} key   QUO_WEBHOOK_KEY, the `whsec_…` value as stored
 * @param {number} maxAgeSeconds   Replay tolerance
 * @returns {boolean}
 */
function verifyQuoSignature(rawBody, headers, key, maxAgeSeconds = MAX_AGE_SECONDS) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signature = headers['webhook-signature'];

  // Fail closed. A missing header or an unconfigured key is a rejection —
  // never an accept.
  if (!id || !timestamp || !signature || !key) return false;

  // webhook-timestamp is UNIX SECONDS, so a real staleness check is possible.
  const ts = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > maxAgeSeconds) return false;

  // The whsec_ prefix is NOT part of the key. Strip it, then base64-DECODE the
  // remainder to raw bytes. Passing the whsec_ string straight into createHmac
  // is the single most common Scheme A bug; only the Svix SDK accepts it.
  const secret = Buffer.from(String(key).replace(/^whsec_/, ''), 'base64');

  // Concatenate onto the RAW BODY BYTES — never onto re-serialized JSON.
  const signedContent = Buffer.concat([
    Buffer.from(`${id}.${timestamp}.`, 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'),
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest('base64');

  // webhook-signature is a SPACE-separated list of `v1,<base64sig>` entries.
  // Accept if ANY v1 entry matches, so secret rotation keeps working.
  return String(signature)
    .split(' ')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      const comma = entry.indexOf(',');
      if (comma === -1) return false;
      if (entry.slice(0, comma) !== 'v1') return false;
      return timingSafeCompare(entry.slice(comma + 1), expected);
    });
}

/**
 * Verify a Scheme B (legacy) Quo delivery.
 *
 * @param {Buffer|string} rawBody      RAW, unparsed request body
 * @param {string|undefined} header    The `openphone-signature` header value
 * @param {string|undefined} signingSecret  QUO_LEGACY_SIGNING_SECRET (bare base64)
 * @param {number} maxAgeSeconds       Replay tolerance
 * @returns {boolean}
 */
function verifyQuoLegacySignature(
  rawBody,
  header,
  signingSecret,
  maxAgeSeconds = MAX_AGE_SECONDS
) {
  if (!header || !signingSecret) return false; // fail closed

  // The legacy signing secret is BASE64 with no prefix — decode it to raw bytes.
  // Pass the BUFFER to createHmac. Quo's own Node sample does
  // `.toString('binary')` and hands createHmac a latin1 STRING, which Node then
  // re-encodes as UTF-8, corrupting every key byte >= 0x80. This form matches
  // Quo's Python sample (base64.b64decode) and is byte-identical for the
  // ASCII-decoding keys Quo issues.
  const key = Buffer.from(String(signingSecret), 'base64');
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');

  // Quo: "Future versions may include multiple signatures separated by commas."
  // Note the separator is a COMMA here — Scheme A uses a SPACE.
  return String(header)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      // <scheme>;<version>;<timestamp>;<signature> — 4 semicolon-separated fields.
      const fields = part.split(';');
      if (fields.length !== 4) return false;
      const [scheme, version, timestamp, provided] = fields;
      if (scheme !== 'hmac' || version !== '1' || !timestamp || !provided) return false;
      if (!isFreshLegacyTimestamp(timestamp, maxAgeSeconds)) return false;

      // TWO parts — no webhook id, unlike Scheme A.
      const signedContent = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]);
      const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
      return timingSafeCompare(provided, expected);
    });
}

/**
 * Legacy timestamps are UNIX MILLISECONDS — the documented example value is
 * `1639710054089`, 13 digits. Treating that as seconds puts every delivery
 * ~52,000 years in the future and silently drops all traffic.
 *
 * Quo's docs never state the unit in words, so this detects it by digit count
 * rather than hardcoding a divisor: correct whichever unit arrives.
 */
function isFreshLegacyTimestamp(timestamp, maxAgeSeconds) {
  const n = Number(timestamp);
  if (!Number.isFinite(n) || n <= 0) return false;
  const ms = String(Math.trunc(n)).length >= 12 ? n : n * 1000;
  return Math.abs(Date.now() - ms) <= maxAgeSeconds * 1000;
}

/** Constant-time compare with the length guard timingSafeEqual requires. */
function timingSafeCompare(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  // Length first — timingSafeEqual THROWS on mismatched lengths, and an
  // uncaught throw here becomes a 500 that Quo retries eight times.
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Quo webhook endpoint.
 *
 * express.raw() hands the handler a Buffer of the exact bytes Quo sent. Quo's
 * docs are explicit: "If your middleware parses or rewrites the JSON body
 * first, verification will fail." Never mount express.json() ahead of this.
 */
app.post('/webhooks/quo', express.raw({ type: 'application/json' }), (req, res) => {
  const rawBody = req.body;

  if (!Buffer.isBuffer(rawBody)) {
    console.error('Raw body missing — is express.json() mounted before this route?');
    return res.status(400).json({ error: 'Raw body unavailable' });
  }

  // Which generation is this? The headers tell us, before we parse anything.
  const hasCurrentHeaders =
    req.headers['webhook-id'] && req.headers['webhook-timestamp'] && req.headers['webhook-signature'];
  const legacyHeader = req.headers['openphone-signature'];

  if (!hasCurrentHeaders && !legacyHeader) {
    // Quo sends no unsigned requests. There is NO handshake, NO challenge, and
    // NO webhook.test event — "Send Test Request" is an ordinary signed
    // delivery. An unsigned request is not from Quo.
    console.error('No Quo signature headers present');
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  const currentKey = process.env.QUO_WEBHOOK_KEY;
  const legacySecret = process.env.QUO_LEGACY_SIGNING_SECRET;

  let verified = false;
  let scheme;

  if (hasCurrentHeaders) {
    scheme = 'current';
    // FAIL CLOSED on misconfiguration, and use 500 (not 400) so an operator can
    // tell "my server is misconfigured" apart from "someone sent a bad signature".
    if (!currentKey) {
      console.error('QUO_WEBHOOK_KEY is not set — refusing to accept unverified webhooks');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }
    verified = verifyQuoSignature(rawBody, req.headers, currentKey);
  } else {
    scheme = 'legacy';
    if (!legacySecret) {
      console.error(
        'QUO_LEGACY_SIGNING_SECRET is not set — refusing to accept unverified webhooks'
      );
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }
    verified = verifyQuoLegacySignature(rawBody, legacyHeader, legacySecret);
  }

  if (!verified) {
    console.error(`Quo webhook signature verification failed (${scheme} scheme)`);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Verified — only now is it safe to parse.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Verified request had an unparseable body:', err.message);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  /**
   * IDEMPOTENCY KEY.
   *
   * `event.id` identifies the EVENT, not the delivery — every endpoint
   * subscribed to it receives the SAME id. The `webhook-id` HEADER is unique
   * per delivery and stable across retries, which is what an idempotency key
   * needs to be. Legacy deliveries have no such header, so fall back to the
   * envelope id.
   *
   * Retain processed keys for at least 28 hours: Quo retries for ~27h35m.
   */
  const idempotencyKey = req.headers['webhook-id'] || event.id;

  console.log(`✓ Verified Quo ${scheme} webhook: ${event.type} (delivery ${idempotencyKey})`);

  // Acknowledge within Quo's 10-second budget, then work asynchronously.
  res.status(200).json({ received: true });

  setImmediate(() => {
    try {
      handleEvent(event, idempotencyKey);
    } catch (err) {
      console.error(`Error handling Quo event ${idempotencyKey}:`, err);
    }
  });
});

/**
 * Normalise the two envelope generations into one shape.
 *
 * Current  (apiVersion "2026-03-30"): data.resource + data.context + data.links
 * Legacy   (apiVersion "v2" / "v3"):  data.object
 *
 * Field names differ too: legacy uses `body`/`from`/`to`; current uses
 * `resource.text` and `context.senderIdentifier`/`context.recipientIdentifiers`.
 */
function normalizeEvent(event) {
  const data = event.data || {};
  const isLegacy = data.object !== undefined;
  return {
    type: event.type,
    apiVersion: event.apiVersion,
    isLegacy,
    resource: isLegacy ? data.object : data.resource || {},
    context: isLegacy ? {} : data.context || {},
    links: isLegacy ? {} : data.links || {},
  };
}

function handleEvent(event, idempotencyKey) {
  // TODO: check idempotencyKey against your store and return early if seen.
  //   if (await store.has(idempotencyKey)) return;

  const { type, resource, context, isLegacy } = normalizeEvent(event);

  /**
   * ORDERING IS NOT GUARANTEED — not across event families and, per Quo,
   * occasionally not even within a single resource. A call.transcript.completed
   * can arrive before the matching call.summary.completed.
   *
   * Don't drive a state machine off arrival order. Compare resource.updatedAt
   * against stored state and drop stale events:
   *
   *   if (stored && new Date(resource.updatedAt) <= new Date(stored.updatedAt)) return;
   */

  switch (type) {
    // --- Message events -----------------------------------------------------
    case 'message.received':
      // Legacy: resource.body / resource.from. Current: resource.text +
      // context.senderIdentifier.
      console.log(
        `💬 Message received from ${resource.from || context.senderIdentifier}: ` +
          `${resource.body ?? resource.text ?? ''}`
      );
      break;
    case 'message.delivered':
      console.log(`✅ Message ${resource.id} delivered`);
      break;
    case 'message.failed':
      console.log(`❌ Message ${resource.id} failed to send`);
      break;
    case 'message.undelivered':
      console.log(`⚠️  Message ${resource.id} was not delivered by the carrier`);
      break;

    // --- Call events --------------------------------------------------------
    case 'call.ringing':
      console.log(`📞 Call ringing: ${resource.id}`);
      break;
    case 'call.menu.selected':
      console.log(`🔢 IVR menu option selected on call ${resource.id}`);
      break;
    case 'call.answered':
      console.log(`📲 Call answered: ${resource.id}`);
      break;
    case 'call.completed':
      console.log(`📴 Call completed: ${resource.id}`);
      break;
    case 'call.forwarded':
      console.log(`↪️  Call forwarded: ${resource.id}`);
      break;
    case 'call.missed':
      console.log(`📵 Call missed: ${resource.id}`);
      break;

    // --- Call AI / media events ---------------------------------------------
    case 'call.recording.completed':
      console.log(`🎙️  Recording ready for call ${resource.id}`);
      break;
    case 'call.summary.completed':
      console.log(`📝 AI summary ready for call ${resource.id}`);
      break;
    case 'call.transcript.completed':
      console.log(`📄 Transcript ready for call ${resource.id}`);
      break;
    case 'call.voicemail.completed':
      console.log(`📬 Voicemail ready for call ${resource.id}`);
      break;

    // --- Contact events (always workspace-wide) -----------------------------
    case 'contact.updated':
      console.log(`👤 Contact updated: ${resource.id}`);
      break;
    case 'contact.deleted':
      console.log(`🗑️  Contact deleted: ${resource.id}`);
      break;

    // --- Task events --------------------------------------------------------
    case 'task.created':
    case 'task.updated':
    case 'task.deleted':
    case 'task.completed':
    case 'task.reopened':
    case 'task.assigned':
    case 'task.unassigned':
    case 'task.overdue':
    case 'task.linked':
    case 'task.unlinked':
    case 'task.duedate.updated':
    case 'task.duedate.removed':
    // Legacy webhooks name the due-date events differently — underscored, and
    // split as "due_date". Keep both or you silently lose due-date changes.
    case 'task.due_date_changed': // legacy alias of task.duedate.updated
    case 'task.due_date_removed': // legacy alias of task.duedate.removed
      console.log(`📋 Task event ${type}: ${resource.id}`);
      break;

    default:
      // `integration.created` / `.updated` / `.deleted` are accepted by the
      // create-webhook events enum but have NO documented payload, so they land
      // here. Log and move on rather than guessing their shape.
      console.log(`ℹ️  Unhandled Quo event type: ${type}${isLegacy ? ' (legacy)' : ''}`);
  }

  // `context.contacts.lookupStatus` is matched | none | unavailable, and
  // `context.participants.resolution` is available | unavailable. In BOTH cases
  // `unavailable` means UNKNOWN, not empty — Quo could not perform the lookup.
  // Only `none` means "we looked and there is genuinely nothing".
  if (context.contacts?.lookupStatus === 'unavailable') {
    console.log('   (contact lookup unavailable — treat contact ids as unknown, not empty)');
  }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (skipped during tests)
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Quo webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/quo`);
    if (!process.env.QUO_WEBHOOK_KEY && !process.env.QUO_LEGACY_SIGNING_SECRET) {
      console.warn('⚠️  Neither QUO_WEBHOOK_KEY nor QUO_LEGACY_SIGNING_SECRET is set');
      console.warn('   Every delivery will be rejected until one matches your webhook’s scheme');
    }
  });
}

module.exports = {
  app,
  server,
  verifyQuoSignature,
  verifyQuoLegacySignature,
  normalizeEvent,
};
