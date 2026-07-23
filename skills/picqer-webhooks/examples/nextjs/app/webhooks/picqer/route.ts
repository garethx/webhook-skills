// Generated with: picqer-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Picqer webhook signature.
 *
 * Picqer signs the raw request body with HMAC-SHA256 keyed on the per-hook
 * secret, base64-encodes it, and sends it in the X-Picqer-Signature header.
 */
function verifyPicqerWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (never parse before verifying)
  const body = await request.text();
  const signature = request.headers.get('x-picqer-signature');

  if (!verifyPicqerWebhook(body, signature, process.env.PICQER_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  const payload = JSON.parse(body);
  const { event, event_triggered_at: eventTriggeredAt, data } = payload;

  console.log(`Received ${event} (triggered at ${eventTriggeredAt})`);

  // Picqer sends no dedicated idempotency key. To deduplicate retried
  // deliveries, derive one from the resource ID in `data` plus the event and
  // its trigger time, e.g. `${event}:${data.idorder}:${eventTriggeredAt}`.
  // TODO: deduplicate on that derived key

  // Dispatch on the event field in the payload (Picqer has no event header)
  switch (event) {
    case 'orders.created':
      console.log('New order:', data?.idorder);
      // TODO: sync order to ERP, trigger downstream flows, etc.
      break;

    case 'orders.completed':
      console.log('Order completed:', data?.idorder);
      // TODO: notify customer, close order in other systems, etc.
      break;

    case 'orders.status_changed':
      console.log('Order status changed:', data?.idorder);
      // TODO: keep external order state in sync
      break;

    case 'picklists.created':
      console.log('Picklist created:', data?.idpicklist);
      // TODO: kick off picking workflows
      break;

    case 'picklists.closed':
      console.log('Picklist closed:', data?.idpicklist);
      // TODO: trigger packing / shipping
      break;

    case 'picklists.shipments.created':
      console.log('Shipment created for picklist:', data?.idpicklist);
      // TODO: send tracking info to the customer
      break;

    case 'products.created':
      console.log('Product created:', data?.idproduct);
      // TODO: sync catalog to storefront
      break;

    case 'products.stock_changed':
      console.log('Product stock changed:', data?.idproduct);
      // TODO: update stock on your storefront
      break;

    case 'purchase_orders.created':
      console.log('Purchase order created:', data?.idpurchaseorder);
      // TODO: notify suppliers, sync procurement
      break;

    case 'returns.created':
      console.log('Return created:', data?.idreturn);
      // TODO: start return handling / refunds
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Acknowledge quickly (Picqer expects 200/201/202 within 10 seconds)
  return NextResponse.json({ received: true });
}
