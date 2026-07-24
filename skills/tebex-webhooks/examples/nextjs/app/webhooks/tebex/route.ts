// Generated with: tebex-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Tebex webhook signature.
 *
 * Tebex signs the hex `X-Signature` header in TWO steps:
 *   1. SHA-256 hash the raw body (hex)
 *   2. HMAC-SHA256 that hash, keyed with the webhook secret (hex)
 * i.e. hash_hmac('sha256', hash('sha256', body), secret)
 *
 * Always verify against the RAW body — a parsed/re-serialized body will not match.
 */
function verifyTebexSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const expected = crypto.createHmac('sha256', secret).update(bodyHash).digest('hex');

  const received = Buffer.from(signatureHeader || '');
  const expectedBuf = Buffer.from(expected);
  return received.length === expectedBuf.length &&
    crypto.timingSafeEqual(received, expectedBuf);
}

interface TebexEvent {
  id: string;
  type: string;
  date?: string;
  subject?: unknown;
}

export async function POST(request: NextRequest) {
  // Read the raw body — do not parse before verifying the signature
  const rawBody = await request.text();
  const signature = request.headers.get('x-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing X-Signature header' },
      { status: 400 }
    );
  }

  const secret = process.env.TEBEX_WEBHOOK_SECRET!;
  if (!verifyTebexSignature(rawBody, signature, secret)) {
    console.error('Tebex webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: TebexEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Setup handshake: echo the id back with a 200 to activate the endpoint
  if (event.type === 'validation.webhook') {
    console.log('Tebex validation.webhook received:', event.id);
    return NextResponse.json({ id: event.id });
  }

  // Handle the event based on type
  switch (event.type) {
    case 'payment.completed':
      console.log('Payment completed:', event.subject);
      // TODO: Grant perks, deliver goods, fulfill the order
      break;

    case 'payment.declined':
      console.log('Payment declined:', event.subject);
      // TODO: Notify the buyer, log the failure
      break;

    case 'payment.refunded':
      console.log('Payment refunded:', event.subject);
      // TODO: Revoke perks, update accounting
      break;

    case 'payment.dispute.opened':
    case 'payment.dispute.won':
    case 'payment.dispute.lost':
    case 'payment.dispute.closed':
      console.log(`Dispute event ${event.type}:`, event.subject);
      // TODO: Flag the account, gather evidence, update case state
      break;

    case 'recurring-payment.started':
      console.log('Subscription started:', event.subject);
      // TODO: Provision recurring access
      break;

    case 'recurring-payment.renewed':
      console.log('Subscription renewed:', event.subject);
      // TODO: Extend access, record the renewal
      break;

    case 'recurring-payment.ended':
      console.log('Subscription ended:', event.subject);
      // TODO: Revoke recurring access
      break;

    case 'recurring-payment.cancellation.requested':
      console.log('Cancellation requested:', event.subject);
      // TODO: Schedule end-of-term revocation
      break;

    case 'recurring-payment.cancellation.aborted':
      console.log('Cancellation aborted:', event.subject);
      // TODO: Keep the subscription active
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 2XX to acknowledge receipt (non-2XX triggers Tebex retries)
  return NextResponse.json({ received: true });
}
