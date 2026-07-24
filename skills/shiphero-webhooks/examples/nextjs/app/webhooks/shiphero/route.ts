// Generated with: shiphero-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a ShipHero webhook signature.
 *
 * ShipHero signs the RAW request body with HMAC-SHA256 keyed on the webhook's
 * shared_signature_secret, base64-encoded, sent in `x-shiphero-hmac-sha256`.
 */
function verifyShipHeroWebhook(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
  } catch {
    // Length mismatch => invalid
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification
  const body = await request.text();
  const hmac = request.headers.get('x-shiphero-hmac-sha256');
  const messageId = request.headers.get('x-shiphero-message-id');

  if (!verifyShipHeroWebhook(body, hmac, process.env.SHIPHERO_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification succeeds
  const payload = JSON.parse(body);

  // ShipHero has no topic header - the event type is in `webhook_type`
  const webhookType = payload.webhook_type as string;

  // Use X-Shiphero-Message-ID to deduplicate retried deliveries
  console.log(`Received "${webhookType}" webhook (message ${messageId})`);

  switch (webhookType) {
    case 'Order Allocated':
      console.log('Order allocated:', payload.order_number ?? payload.order_id);
      // TODO: Trigger downstream fulfillment, notify customer, etc.
      break;

    case 'Shipment Update':
      console.log('Shipment update for order:', payload.order_number ?? payload.order_id);
      // TODO: Send tracking email, update order status, etc.
      break;

    case 'Inventory Update':
      console.log('Inventory update for', payload.inventory?.length ?? 0, 'item(s)');
      // TODO: Sync stock levels to storefront/ERP, etc.
      break;

    case 'Order Canceled':
      console.log('Order canceled:', payload.order_number ?? payload.order_id);
      // TODO: Refund, restock, notify systems, etc.
      break;

    case 'PO Update':
      console.log('PO update:', payload.po_number ?? payload.po_id);
      // TODO: Track inbound inventory / receiving, etc.
      break;

    case 'Return Update':
      console.log('Return update:', payload.return_id ?? payload.rma);
      // TODO: Process refund, restock returned items, etc.
      break;

    case 'Tote Complete':
      console.log('Tote complete:', payload.tote_name ?? payload.tote_id);
      // TODO: Track picking progress, etc.
      break;

    case 'Package Added':
      console.log('Package added to order:', payload.order_number ?? payload.order_id);
      // TODO: Update packing / carton records, etc.
      break;

    default:
      console.log(`Unhandled webhook type: ${webhookType}`);
  }

  // ShipHero expects a 2xx with this exact acknowledgement body
  return NextResponse.json({ code: '200', Status: 'Success' });
}
