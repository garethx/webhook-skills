// Generated with: recharge-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Recharge webhook signature.
 *
 * GOTCHA: despite the `X-Recharge-Hmac-Sha256` header name, this is NOT HMAC.
 * It is a plain SHA-256 of (clientSecret + rawBody), with the secret prepended,
 * hex-encoded.
 */
function verifyRechargeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  clientSecret: string
): boolean {
  if (!signatureHeader) return false;

  const digest = crypto
    .createHash('sha256')
    .update(clientSecret) // secret first
    .update(rawBody) // then the raw body
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body as text - do NOT use request.json() before verifying.
  const body = await request.text();
  const signature = request.headers.get('x-recharge-hmac-sha256');
  const topic = request.headers.get('x-recharge-topic');

  // 1. Verify first
  if (!verifyRechargeWebhook(body, signature, process.env.RECHARGE_API_CLIENT_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 2. Parse only after verification. Recharge wraps the resource by key,
  //    e.g. { "charge": {...} }, { "subscription": {...} }, { "order": {...} }.
  const payload = JSON.parse(body);

  console.log(`Received ${topic} webhook`);

  // 3. Dispatch on the topic. Return 200 fast; do slow work asynchronously.
  switch (topic) {
    case 'charge/created':
      console.log('Charge created:', payload.charge?.id);
      // TODO: pre-billing checks, previews, etc.
      break;

    case 'charge/paid':
      console.log('Charge paid:', payload.charge?.id);
      // TODO: grant access, record revenue, trigger fulfillment, etc.
      break;

    case 'charge/failed':
      console.log('Charge failed:', payload.charge?.id);
      // TODO: dunning, notify customer, etc.
      break;

    case 'subscription/created':
      console.log('Subscription created:', payload.subscription?.id);
      // TODO: onboarding, provisioning, etc.
      break;

    case 'subscription/cancelled':
      console.log('Subscription cancelled:', payload.subscription?.id);
      // TODO: revoke access, win-back flow, etc.
      break;

    case 'order/created':
      console.log('Order created:', payload.order?.id);
      // TODO: sync to OMS/ERP, etc.
      break;

    case 'order/processed':
      console.log('Order processed:', payload.order?.id);
      // TODO: trigger fulfillment, etc.
      break;

    case 'customer/updated':
      console.log('Customer updated:', payload.customer?.id);
      // TODO: CRM sync, payment method updates, etc.
      break;

    default:
      console.log(`Unhandled topic: ${topic}`);
  }

  // Acknowledge receipt within 5 seconds
  return NextResponse.json({ received: true });
}
