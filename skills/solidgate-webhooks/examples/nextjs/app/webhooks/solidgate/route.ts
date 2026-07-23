// Generated with: solidgate-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const PUBLIC_KEY = process.env.SOLIDGATE_WEBHOOK_PUBLIC_KEY!;
const SECRET_KEY = process.env.SOLIDGATE_WEBHOOK_SECRET_KEY!;

/**
 * Verify a Solidgate webhook signature.
 *
 * Solidgate signs `publicKey + rawBody + publicKey` with HMAC-SHA512 using the
 * webhook secret key, takes the HEX digest, then Base64-encodes that hex STRING
 * (the double-encode quirk). Verify against the RAW body, never re-serialized JSON.
 */
export function verifySolidgateSignature(
  rawBody: string,
  signature: string,
  publicKey: string,
  secretKey: string
): boolean {
  const hex = crypto
    .createHmac('sha512', secretKey)
    .update(publicKey + rawBody + publicKey)
    .digest('hex');
  const expected = Buffer.from(hex).toString('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Buffer length mismatch => invalid signature
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification (do not parse first)
  const rawBody = await request.text();
  const signature = request.headers.get('signature');
  const merchant = request.headers.get('merchant');
  const eventType = request.headers.get('solidgate-event-type');
  const eventId = request.headers.get('solidgate-event-id');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  // The `merchant` header must match our configured public key
  if (merchant && merchant !== PUBLIC_KEY) {
    console.error('Unexpected merchant (public key) in webhook');
    return NextResponse.json({ error: 'Invalid merchant' }, { status: 400 });
  }

  if (!verifySolidgateSignature(rawBody, signature, PUBLIC_KEY, SECRET_KEY)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Safe to parse now that the signature is verified
  const payload = JSON.parse(rawBody);

  // Deduplicate retried deliveries using the event id (idempotency)
  console.log(`Received ${eventType} (event ${eventId})`);

  switch (eventType) {
    case 'card_gate.order.updated':
      console.log('Card order updated:', payload.order?.order_id, payload.order?.status);
      // TODO: fulfil order, reconcile payment, send receipt
      break;

    case 'card_gate.chargeback.received':
      console.log('Chargeback received:', payload.order?.order_id);
      // TODO: revoke access, update accounting, open dispute workflow
      break;

    case 'card_gate.fraud_alert.received':
      console.log('Fraud alert received:', payload.order?.order_id);
      // TODO: flag customer, pre-empt chargeback
      break;

    case 'card_gate.prevention_alert.received':
      console.log('Prevention alert received:', payload.order?.order_id);
      // TODO: auto-refund to avoid a chargeback
      break;

    case 'subscription.updated.v2':
      console.log('Subscription updated:', payload.subscription?.id, payload.subscription?.status);
      // TODO: grant/revoke entitlements, run dunning
      break;

    case 'alt_gate.order.updated':
      console.log('APM order updated:', payload.order?.order_id, payload.order?.status);
      // TODO: fulfil APM order, reconcile
      break;

    case 'alt_gate.paypal_dispute.received':
      console.log('PayPal dispute received:', payload.order?.order_id);
      // TODO: handle PayPal dispute
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Return 2xx within 30s to acknowledge receipt
  return NextResponse.json({ received: true });
}
