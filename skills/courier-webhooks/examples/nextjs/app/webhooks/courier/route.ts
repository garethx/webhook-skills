// Generated with: courier-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Courier outbound webhook signature.
 *
 * Courier signs each webhook with HMAC-SHA256. The `courier-signature` header
 * looks like `t=<epoch_ms>,signature=<hex_digest>`, and the signed content is
 * `<timestamp>.<rawBody>` (timestamp + "." + the raw request body).
 */
export function verifyCourierWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceMs: number = 5 * 60 * 1000
): boolean {
  if (!signatureHeader) return false;

  // Parse "t=<ms>,signature=<hex>"
  const parts: Record<string, string> = {};
  for (const segment of signatureHeader.split(',')) {
    const i = segment.indexOf('=');
    if (i !== -1) parts[segment.slice(0, i).trim()] = segment.slice(i + 1).trim();
  }
  const timestamp = parts.t;
  const signature = parts.signature;
  if (!timestamp || !signature) return false;

  // Courier timestamps are epoch milliseconds — reject stale deliveries
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > toleranceMs) return false;

  // Recompute HMAC over "<timestamp>.<rawBody>"
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false; // hex length mismatch = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not parse before verifying)
  const rawBody = await request.text();
  const signature = request.headers.get('courier-signature');

  if (!verifyCourierWebhook(rawBody, signature, process.env.COURIER_WEBHOOK_SECRET!)) {
    console.error('Courier webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification (envelope: { type, data })
  const event = JSON.parse(rawBody) as { type: string; data: Record<string, any> };
  const { type, data } = event;

  switch (type) {
    case 'message:updated':
      // Courier does NOT emit per-status events — status lives in `data`
      console.log(`Message updated: ${data?.id} status=${data?.status}`);
      // TODO: Sync delivery status, retry, analytics, etc.
      break;

    case 'notification:submitted':
      console.log('Notification submitted:', data?.id);
      // TODO: Record send in flight, audit trail, etc.
      break;

    case 'notification:submission_canceled':
      console.log('Notification submission canceled:', data?.id);
      // TODO: Reconcile canceled send, etc.
      break;

    case 'notification:published':
      console.log('Notification published:', data?.id);
      // TODO: Invalidate template cache, sync versions, etc.
      break;

    case 'audiences:updated':
      console.log('Audience updated:', data?.id);
      // TODO: Sync segment definition, etc.
      break;

    case 'audiences:user:matched':
      console.log('User matched audience:', data?.audience_id, data?.user_id);
      // TODO: Trigger onboarding, tag user, etc.
      break;

    case 'audiences:user:unmatched':
      console.log('User unmatched audience:', data?.audience_id, data?.user_id);
      // TODO: Revoke access, update CRM, etc.
      break;

    case 'audiences:calculated':
      console.log('Audience calculated:', data?.audience_id);
      // TODO: Kick off downstream jobs, etc.
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }

  // Return 200 quickly to acknowledge receipt; do heavy work async
  return NextResponse.json({ received: true });
}
