// Generated with: frontapp-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const webhookSecret = process.env.FRONT_WEBHOOK_SECRET!;

/**
 * Verify a Front application webhook signature.
 * Front signs `timestamp + ":" + rawBody` with HMAC-SHA256 (base64), keyed with the
 * app signing key, and delivers it in the X-Front-Signature header.
 */
function verifyFrontSignature(
  rawBody: Buffer,
  timestamp: string | null,
  signature: string | null,
  secret: string
): boolean {
  if (!timestamp || !signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp + ':');
  hmac.update(rawBody);
  const expected = hmac.digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not JSON.parse first).
  const rawBody = Buffer.from(await request.arrayBuffer());

  // 1. Subscription validation: echo the X-Front-Challenge header within 10s.
  const challenge = request.headers.get('x-front-challenge');
  if (challenge) {
    return NextResponse.json({ challenge }, { status: 200 });
  }

  // 2. Verify the signature on real events.
  const timestamp = request.headers.get('x-front-request-timestamp');
  const signature = request.headers.get('x-front-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing X-Front-Signature header' },
      { status: 400 }
    );
  }

  if (!verifyFrontSignature(rawBody, timestamp, signature, webhookSecret)) {
    console.error('Front webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 3. Parse and dispatch. `type` carries the event name.
  let event: { type?: string; payload?: any };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  switch (event.type) {
    case 'inbound':
      console.log('Inbound message received:', event.payload?.id);
      // TODO: triage, sync to CRM, alert, etc.
      break;

    case 'outbound':
      console.log('Outbound message sent:', event.payload?.id);
      // TODO: log reply, track SLA, etc.
      break;

    case 'move':
      console.log('Conversation moved:', event.payload?.conversation?.id);
      // TODO: routing analytics, notifications, etc.
      break;

    case 'assign':
      console.log('Conversation assigned:', event.payload?.conversation?.id);
      // TODO: workload tracking, escalation, etc.
      break;

    case 'archive':
      console.log('Conversation archived:', event.payload?.conversation?.id);
      // TODO: close-out workflow, metrics, etc.
      break;

    case 'tag':
      console.log('Conversation tagged:', event.payload?.conversation?.id);
      // TODO: categorization, automation, etc.
      break;

    case 'comment':
      console.log('Comment added:', event.payload?.conversation?.id);
      // TODO: internal collaboration hooks, etc.
      break;

    case 'message_bounce_error':
      console.log('Message bounced:', event.payload?.id);
      // TODO: bounce handling, list hygiene, etc.
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Acknowledge quickly (Front expects 2xx within 5s).
  return NextResponse.json({ received: true }, { status: 200 });
}
