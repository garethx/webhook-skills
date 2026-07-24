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
    // Replay guard: x-zh-hook-timestamp is UNIX milliseconds.
    if (Math.abs(Date.now() - Number(timestamp)) > TOLERANCE_MS) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody + timestamp, 'utf8')
      .digest('hex');
    return timingSafeEqual(expected, signature);
  }

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
  const payloadType = request.headers.get('x-zh-hook-payload-type');
  const notificationId = request.headers.get('x-zh-hook-notification-id');
  const data = JSON.parse(rawBody);

  // TODO: use notificationId to deduplicate (idempotency).
  void notificationId;

  switch (payloadType) {
    case 'trade_status_changed':
      console.log(`Trade ${data.trade_id} status: ${data.status}`);
      // TODO: update order/settlement state (accepted | active | terminated).
      break;

    case 'account_balance.changed':
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
