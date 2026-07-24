// Generated with: shopline-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a SHOPLINE webhook signature.
 *
 * SHOPLINE signs the raw request body with HMAC-SHA256 using the app secret and
 * sends the digest in the `X-Shopline-Hmac-Sha256` header. The docs show a
 * base64 digest (Shopify-style); a stray sample shows hex — so we accept either.
 */
export function verifyShoplineWebhook(
  rawBody: string,
  hmacHeader: string | null,
  secret: string
): boolean {
  if (!hmacHeader) return false;

  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest();

  // Accept base64 (documented) or hex (stray sample) — timing-safe either way.
  return [digest.toString('base64'), digest.toString('hex')].some((expected) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected));
    } catch {
      return false; // length mismatch → not a match
    }
  });
}

export async function POST(request: NextRequest) {
  // Read the raw body — SHOPLINE signs the raw bytes, not parsed JSON
  const rawBody = await request.text();
  const hmac = request.headers.get('x-shopline-hmac-sha256');
  const topic = request.headers.get('x-shopline-topic');
  const shop = request.headers.get('x-shopline-shop-domain');
  const webhookId = request.headers.get('x-shopline-webhook-id');

  // Verify webhook signature against the raw body
  if (!verifyShoplineWebhook(rawBody, hmac, process.env.SHOPLINE_APP_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  const payload = JSON.parse(rawBody);

  // Use the stable delivery ID to process each event idempotently
  console.log(`Received ${topic} from ${shop} (delivery ${webhookId})`);

  // Handle the event based on topic
  switch (topic) {
    case 'orders/create':
      console.log('New order:', payload.id);
      // TODO: Process new order, sync to fulfillment, etc.
      break;

    case 'orders/update':
      console.log('Order updated:', payload.id);
      // TODO: Update order status, sync changes, etc.
      break;

    case 'orders/paid':
      console.log('Order paid:', payload.id);
      // TODO: Trigger fulfillment, record payment, etc.
      break;

    case 'orders/cancelled':
      console.log('Order cancelled:', payload.id);
      // TODO: Refund processing, inventory adjustment, etc.
      break;

    case 'products/create':
      console.log('New product:', payload.id);
      // TODO: Sync to external catalog, etc.
      break;

    case 'products/update':
      console.log('Product updated:', payload.id);
      // TODO: Update external listings, etc.
      break;

    case 'products/delete':
      console.log('Product deleted:', payload.id);
      // TODO: Remove from external catalog, etc.
      break;

    case 'collect/create':
      console.log('Product added to collection:', payload.id);
      // TODO: Re-sync merchandising / category feeds, etc.
      break;

    case 'collect/delete':
      console.log('Product removed from collection:', payload.id);
      // TODO: Re-sync merchandising / category feeds, etc.
      break;

    case 'customers/create':
      console.log('New customer:', payload.id);
      // TODO: Welcome email, CRM sync, etc.
      break;

    case 'app/uninstalled':
      console.log('App uninstalled from shop:', shop);
      // TODO: Cleanup shop data, etc.
      break;

    default:
      console.log(`Unhandled topic: ${topic}`);
  }

  // Return 200 within 5 seconds to acknowledge receipt
  return NextResponse.json({ received: true });
}
