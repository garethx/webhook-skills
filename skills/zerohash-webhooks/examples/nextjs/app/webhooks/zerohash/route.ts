// Generated with: zerohash-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const webhookSecret = process.env.ZEROHASH_WEBHOOK_SECRET!;

// Reject timestamps older/newer than this to guard against replay attacks.
const TOLERANCE_MS = 5 * 60 * 1000; // ±5 minutes

function timingSafeEqual(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false; // length mismatch => invalid
  }
}

/**
 * Normalize x-zh-hook-timestamp to milliseconds.
 *
 * Zero Hash documents the ±5 minute replay window but NOT whether the timestamp
 * is in seconds or milliseconds. Assuming the wrong unit rejects every delivery,
 * so detect it from the magnitude: a ~10-digit value is seconds, a ~13-digit
 * value is already milliseconds. Only the staleness check needs this — the HMAC
 * always covers the timestamp string exactly as received.
 */
function toMillis(timestamp: string): number {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return NaN;
  return Math.abs(value) < 1e11 ? value * 1000 : value;
}

/**
 * Verify a Zero Hash webhook signature.
 *
 * Zero Hash has no webhook SDK, so we verify manually. It signs the RAW request
 * body with HMAC-SHA256 (hex). Recommended scheme signs `payload + timestamp`
 * (no delimiter) from `x-zh-hook-signature` / `x-zh-hook-timestamp`; the legacy
 * scheme signs `payload` only via `x-zh-hook-signature-256`.
 */
function verifyZeroHash(rawBody: string, headers: Headers, secret: string): boolean {
  const signature = headers.get('x-zh-hook-signature');
  const timestamp = headers.get('x-zh-hook-timestamp');

  if (signature && timestamp) {
    // Replay guard: accept a seconds or milliseconds timestamp (unit undocumented).
    const timestampMs = toMillis(timestamp);
    if (!Number.isFinite(timestampMs)) return false;
    if (Math.abs(Date.now() - timestampMs) > TOLERANCE_MS) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody + timestamp, 'utf8')
      .digest('hex');
    return timingSafeEqual(expected, signature);
  }

  // NOTE: the legacy scheme has NO replay window — a captured request stays
  // valid forever. If your Zero Hash rep has put you on the new
  // x-zh-hook-signature + x-zh-hook-timestamp scheme, DELETE this branch.
  const legacy = headers.get('x-zh-hook-signature-256');
  if (legacy) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');
    return timingSafeEqual(expected, legacy);
  }

  return false;
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification (do not JSON.parse first).
  const rawBody = await request.text();

  if (
    !request.headers.get('x-zh-hook-signature') &&
    !request.headers.get('x-zh-hook-signature-256')
  ) {
    return NextResponse.json(
      { error: 'Missing Zero Hash signature header' },
      { status: 400 }
    );
  }

  if (!verifyZeroHash(rawBody, request.headers, webhookSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Signature verified - safe to parse. The event type is in a header.
  // Zero Hash's docs are inconsistent about the exact payload-type strings
  // (underscore vs dot forms) — confirm them with your Zero Hash rep and let the
  // default branch log anything unexpected.
  const payloadType = request.headers.get('x-zh-hook-payload-type');
  // Unconfirmed header — may be absent (`.get()` returns null), so fall back to
  // an id in the body or a hash of the payload for idempotency.
  const notificationId = request.headers.get('x-zh-hook-notification-id');
  const data = JSON.parse(rawBody);

  // TODO: use notificationId (when present) to deduplicate (idempotency).
  void notificationId;

  switch (payloadType) {
    case 'trade_status_changed':
      console.log(`Trade ${data.trade_id} status: ${data.status}`);
      // TODO: update order/settlement state (accepted | active | terminated).
      break;

    case 'payment_status_changed':
      console.log(`Payment ${data.payment_id} status: ${data.status}`);
      // TODO: update payment state. The payload shape is not documented —
      // log a real delivery before branching on specific status values.
      break;

    // Balance event name is unconfirmed — Zero Hash's docs show a dot form,
    // so accept the underscore spelling too.
    case 'account_balance.changed':
    case 'account_balance_changed':
      console.log(
        `Balance changed: ${data.asset} ${data.account_type} = ${data.balance}`
      );
      // TODO: reconcile available/collateral balances.
      break;

    default:
      console.log(`Unhandled payload type: ${payloadType}`);
  }

  // Return 200 to acknowledge receipt.
  return NextResponse.json({ received: true });
}
