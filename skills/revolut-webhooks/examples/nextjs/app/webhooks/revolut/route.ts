// Generated with: revolut-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const TOLERANCE_MS = 5 * 60 * 1000; // Revolut recommends a 5-minute tolerance

/**
 * Verify a Revolut webhook signature.
 *
 * Revolut signs `v1.{timestamp}.{raw body}` with HMAC-SHA256 (hex) using the
 * webhook signing secret (wsk_...). The Revolut-Signature header holds one or
 * more `v1=<hex>` values (comma-separated during secret rotation).
 */
export function verifyRevolutSignature(
  rawBody: string,
  timestamp: string | null,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!timestamp || !signatureHeader || !secret) return false;

  // Reject stale timestamps. Header is a UNIX timestamp in milliseconds.
  const ts = Number(timestamp);
  const tsMs = timestamp.length <= 10 ? ts * 1000 : ts; // tolerate seconds or ms
  if (!Number.isFinite(ts) || Math.abs(Date.now() - tsMs) > TOLERANCE_MS) {
    return false;
  }

  const expected =
    'v1=' +
    crypto.createHmac('sha256', secret).update(`v1.${timestamp}.${rawBody}`).digest('hex');

  // Header may hold multiple signatures during rotation — accept any match.
  return signatureHeader.split(',').some((sig) => {
    const a = Buffer.from(sig.trim());
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not JSON.parse first)
  const rawBody = await request.text();
  const signature = request.headers.get('revolut-signature');
  const timestamp = request.headers.get('revolut-request-timestamp');

  if (!signature || !timestamp) {
    return NextResponse.json(
      { error: 'Missing Revolut signature headers' },
      { status: 400 }
    );
  }

  if (!verifyRevolutSignature(rawBody, timestamp, signature, process.env.REVOLUT_SIGNING_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { event: string; order_id?: string; merchant_order_ext_ref?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Handle the event based on type
  switch (event.event) {
    case 'ORDER_COMPLETED':
      console.log('Order completed:', event.order_id);
      // TODO: Fulfil the order, send a receipt, etc.
      break;

    case 'ORDER_AUTHORISED':
      console.log('Order authorised:', event.order_id);
      // TODO: Reserve stock / prepare capture, etc.
      break;

    case 'ORDER_CANCELLED':
      console.log('Order cancelled:', event.order_id);
      // TODO: Release reserved stock, update order status, etc.
      break;

    case 'ORDER_PAYMENT_AUTHENTICATED':
      console.log('Payment authenticated:', event.order_id);
      // TODO: Track authentication progress, etc.
      break;

    case 'ORDER_PAYMENT_DECLINED':
      console.log('Payment declined:', event.order_id);
      // TODO: Notify the customer, offer another payment method, etc.
      break;

    case 'ORDER_PAYMENT_FAILED':
      console.log('Payment failed:', event.order_id);
      // TODO: Retry, alert the customer, etc.
      break;

    default:
      console.log(`Unhandled event type: ${event.event}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
