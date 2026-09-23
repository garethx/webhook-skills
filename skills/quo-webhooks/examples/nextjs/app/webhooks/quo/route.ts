// Generated with: quo-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * QUO HAS TWO WEBHOOK GENERATIONS WITH TWO DIFFERENT SIGNATURE SCHEMES.
 *
 * Which one an endpoint receives is decided by how the subscription was
 * created, not by anything configured here — so a handler that may receive
 * both must implement both. They are NOT interchangeable.
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
 */

/** Replay window for both schemes. Quo's own example uses 5 minutes. */
const MAX_AGE_SECONDS = Number(process.env.QUO_MAX_AGE_SECONDS || 300);

/** The current (2026-03-30) envelope. */
export interface QuoEvent {
  id: string;
  apiVersion: string;
  createdAt: string;
  type: string;
  /** Legacy deliveries also carry a top-level `object: "event"`. */
  object?: string;
  data: {
    /** Current generation. */
    resource?: Record<string, unknown>;
    context?: Record<string, unknown>;
    links?: { quo?: string | null };
    /** Legacy generation (apiVersion "v2" / "v3"). */
    object?: Record<string, unknown>;
  };
}

export interface QuoSignatureHeaders {
  'webhook-id'?: string | null;
  'webhook-timestamp'?: string | null;
  'webhook-signature'?: string | null;
}

/**
 * Verify a Scheme A (current) Quo delivery.
 *
 * @param rawBody  RAW, unparsed request body
 * @param headers  webhook-id / webhook-timestamp / webhook-signature
 * @param key      QUO_WEBHOOK_KEY — the `whsec_…` value exactly as stored
 */
export function verifyQuoSignature(
  rawBody: Buffer | string,
  headers: QuoSignatureHeaders,
  key: string | undefined,
  maxAgeSeconds: number = MAX_AGE_SECONDS
): boolean {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signature = headers['webhook-signature'];

  // Fail closed: a missing header or an unconfigured key is a rejection.
  if (!id || !timestamp || !signature || !key) return false;

  // webhook-timestamp is UNIX SECONDS, so a real staleness check is possible.
  const ts = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > maxAgeSeconds) return false;

  // The whsec_ prefix is NOT part of the key. Strip it, then base64-DECODE the
  // remainder. Passing the whsec_ string straight into createHmac is a bug;
  // only the Svix SDK accepts the prefixed form.
  const secret = Buffer.from(key.replace(/^whsec_/, ''), 'base64');

  // Concatenate onto the RAW BODY BYTES — never onto re-serialized JSON.
  const signedContent = Buffer.concat([
    Buffer.from(`${id}.${timestamp}.`, 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8'),
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest('base64');

  // SPACE-separated `v1,<base64sig>` entries. Accept if ANY v1 entry matches,
  // so secret rotation keeps working.
  return signature
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
 * @param rawBody        RAW, unparsed request body
 * @param header         The `openphone-signature` header value
 * @param signingSecret  QUO_LEGACY_SIGNING_SECRET (bare base64, no prefix)
 */
export function verifyQuoLegacySignature(
  rawBody: Buffer | string,
  header: string | null | undefined,
  signingSecret: string | undefined,
  maxAgeSeconds: number = MAX_AGE_SECONDS
): boolean {
  if (!header || !signingSecret) return false; // fail closed

  // The legacy signing secret is BASE64 with no prefix — decode to raw bytes
  // and pass the BUFFER to createHmac. Quo's own Node sample does
  // `.toString('binary')` and hands createHmac a latin1 STRING, which Node then
  // re-encodes as UTF-8, corrupting every key byte >= 0x80. This form matches
  // Quo's Python sample (base64.b64decode).
  const key = Buffer.from(signingSecret, 'base64');
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

  // Quo: "Future versions may include multiple signatures separated by commas."
  // Note the separator is a COMMA here — Scheme A uses a SPACE.
  return header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      // <scheme>;<version>;<timestamp>;<signature> — 4 semicolon fields.
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
 * rather than hardcoding a divisor.
 */
export function isFreshLegacyTimestamp(timestamp: string, maxAgeSeconds: number): boolean {
  const n = Number(timestamp);
  if (!Number.isFinite(n) || n <= 0) return false;
  const ms = String(Math.trunc(n)).length >= 12 ? n : n * 1000;
  return Math.abs(Date.now() - ms) <= maxAgeSeconds * 1000;
}

/** Constant-time compare with the length guard timingSafeEqual requires. */
function timingSafeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // Length first — timingSafeEqual THROWS on mismatched lengths, and an
  // uncaught throw becomes a 500 that Quo retries eight times.
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Normalise the two envelope generations into one shape.
 *
 * Current (apiVersion "2026-03-30"): data.resource + data.context + data.links
 * Legacy  (apiVersion "v2" / "v3"):  data.object
 *
 * Field names differ too: legacy uses `body`/`from`/`to`; current uses
 * `resource.text` and `context.senderIdentifier`/`context.recipientIdentifiers`.
 */
export function normalizeEvent(event: QuoEvent) {
  const data = event.data || {};
  const isLegacy = data.object !== undefined;
  return {
    type: event.type,
    apiVersion: event.apiVersion,
    isLegacy,
    resource: (isLegacy ? data.object : data.resource) || {},
    context: (isLegacy ? {} : data.context) || {},
    links: (isLegacy ? {} : data.links) || {},
  };
}

export async function POST(request: NextRequest) {
  // Read the RAW bytes first. Quo's docs: "If your middleware parses or
  // rewrites the JSON body first, verification will fail." Never call
  // request.json() before verifying.
  const rawBody = await request.text();

  const currentHeaders: QuoSignatureHeaders = {
    'webhook-id': request.headers.get('webhook-id'),
    'webhook-timestamp': request.headers.get('webhook-timestamp'),
    'webhook-signature': request.headers.get('webhook-signature'),
  };
  const legacyHeader = request.headers.get('openphone-signature');

  const hasCurrentHeaders =
    !!currentHeaders['webhook-id'] &&
    !!currentHeaders['webhook-timestamp'] &&
    !!currentHeaders['webhook-signature'];

  if (!hasCurrentHeaders && !legacyHeader) {
    // Quo sends no unsigned requests. There is NO handshake, NO challenge and
    // NO webhook.test event — "Send Test Request" is an ordinary signed
    // delivery. An unsigned request is not from Quo.
    console.error('No Quo signature headers present');
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  let verified = false;
  let scheme: 'current' | 'legacy';

  if (hasCurrentHeaders) {
    scheme = 'current';
    const key = process.env.QUO_WEBHOOK_KEY;
    // FAIL CLOSED on misconfiguration, and use 500 (not 400) so an operator can
    // tell "my server is misconfigured" apart from "bad signature".
    if (!key) {
      console.error('QUO_WEBHOOK_KEY is not set — refusing to accept unverified webhooks');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    verified = verifyQuoSignature(rawBody, currentHeaders, key);
  } else {
    scheme = 'legacy';
    const secret = process.env.QUO_LEGACY_SIGNING_SECRET;
    if (!secret) {
      console.error(
        'QUO_LEGACY_SIGNING_SECRET is not set — refusing to accept unverified webhooks'
      );
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    verified = verifyQuoLegacySignature(rawBody, legacyHeader, secret);
  }

  if (!verified) {
    console.error(`Quo webhook signature verification failed (${scheme} scheme)`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Verified — only now is it safe to parse.
  let event: QuoEvent;
  try {
    event = JSON.parse(rawBody) as QuoEvent;
  } catch {
    console.error('Verified request had an unparseable body');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  /**
   * IDEMPOTENCY KEY.
   *
   * `event.id` identifies the EVENT, not the delivery — every endpoint
   * subscribed to it receives the SAME id. The `webhook-id` HEADER is unique
   * per delivery and stable across retries. Legacy deliveries have no such
   * header, so fall back to the envelope id.
   *
   * Retain processed keys for at least 28 hours: Quo retries for ~27h35m.
   */
  const idempotencyKey = currentHeaders['webhook-id'] || event.id;

  console.log(`✓ Verified Quo ${scheme} webhook: ${event.type} (delivery ${idempotencyKey})`);

  try {
    await handleEvent(event, idempotencyKey);
  } catch (err) {
    // Log and still return 200: a non-2xx triggers Quo's 8-attempt retry chain,
    // which is rarely what you want for a bug in your own handler. Return 500
    // instead only when a retry could plausibly succeed.
    console.error(`Error handling Quo event ${idempotencyKey}:`, err);
  }

  // Quo's budget is 10 seconds. For slow work, enqueue here and return
  // immediately rather than awaiting it.
  return NextResponse.json({ received: true }, { status: 200 });
}

async function handleEvent(event: QuoEvent, idempotencyKey: string) {
  // TODO: check idempotencyKey against your store and return early if seen.
  //   if (await store.has(idempotencyKey)) return;

  const { type, resource, context, isLegacy } = normalizeEvent(event);

  /**
   * ORDERING IS NOT GUARANTEED — not across event families and, per Quo,
   * occasionally not even within a single resource. A call.transcript.completed
   * can arrive before the matching call.summary.completed. Compare
   * resource.updatedAt against stored state and drop stale events.
   */

  switch (type) {
    // --- Message events -----------------------------------------------------
    case 'message.received': {
      // Legacy: resource.body / resource.from. Current: resource.text +
      // context.senderIdentifier.
      const from = resource.from ?? context.senderIdentifier;
      const text = resource.body ?? resource.text ?? '';
      console.log(`💬 Message received from ${from}: ${text}`);
      break;
    }
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
  const contacts = context.contacts as { lookupStatus?: string } | undefined;
  if (contacts?.lookupStatus === 'unavailable') {
    console.log('   (contact lookup unavailable — treat contact ids as unknown, not empty)');
  }
}
