// Generated with: shipbob-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.SHIPBOB_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json(
      { error: 'Missing required webhook headers (webhook-id, webhook-timestamp, webhook-signature)' },
      { status: 400 }
    );
  }

  // Read the RAW body (do not JSON.parse before verifying).
  const rawBody = await request.text();

  let event: Record<string, unknown>;
  try {
    const wh = new Webhook(secret);
    // standardwebhooks verifies signature + timestamp and returns the parsed payload.
    event = wh.verify(rawBody, {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': webhookSignature,
    }) as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    const errorResponse = message === 'Message timestamp too old' ? 'Timestamp too old' : 'Invalid signature';
    console.error('Webhook verification failed:', err);
    return NextResponse.json({ error: errorResponse }, { status: 400 });
  }

  // The topic identifies the event; it is a header, not a body field.
  const topic = request.headers.get('x-webhook-topic') || 'unknown';
  // ShipBob retries; dedupe on webhook-id for idempotency.
  console.log(`Received ShipBob webhook: ${topic} (id=${webhookId})`);

  switch (topic) {
    case 'order.shipped':
      console.log('Order shipped:', { data: event });
      break;
    case 'order.shipment.delivered':
      console.log('Shipment delivered:', { data: event });
      break;
    case 'order.shipment.tracking.updated':
      console.log('Tracking updated:', { data: event });
      break;
    case 'order.shipment.exception':
      console.log('Shipment exception:', { data: event });
      break;
    case 'return.created':
      console.log('Return created:', { data: event });
      break;
    case 'wro.created':
      console.log('Warehouse Receiving Order created:', { data: event });
      break;
    case 'billing.charge.created':
      console.log('Billing charge created:', { data: event });
      break;
    default:
      console.log('Unhandled topic:', topic);
  }

  return NextResponse.json({ success: true, topic }, { status: 200 });
}
