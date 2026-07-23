// Generated with: shipstation-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import {
  verifyToken,
  fetchResource,
  type ShipStationWebhook,
} from './verify';

export async function POST(request: NextRequest) {
  // 1. Verify the secret token from the query string (V1 has no signature)
  const token = request.nextUrl.searchParams.get('token');
  if (!verifyToken(token, process.env.SHIPSTATION_WEBHOOK_SECRET)) {
    return NextResponse.json(
      { error: 'Invalid or missing webhook token' },
      { status: 401 }
    );
  }

  // 2. Thin payload: { resource_url, resource_type }
  let payload: ShipStationWebhook;
  try {
    payload = (await request.json()) as ShipStationWebhook;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { resource_url: resourceUrl, resource_type: resourceType } = payload || {};
  if (!resourceType || !resourceUrl) {
    return NextResponse.json(
      { error: 'Missing resource_type or resource_url' },
      { status: 400 }
    );
  }

  // 3. Dispatch on the event type
  switch (resourceType) {
    case 'ORDER_NOTIFY':
    case 'ITEM_ORDER_NOTIFY':
      console.log('New order(s) imported:', resourceUrl);
      // TODO: sync orders into your system
      break;
    case 'SHIP_NOTIFY':
    case 'ITEM_SHIP_NOTIFY':
      console.log('Order(s) shipped:', resourceUrl);
      // TODO: send tracking notifications, mark fulfilled
      break;
    case 'FULFILLMENT_SHIPPED':
      console.log('Fulfillment shipped:', resourceUrl);
      // TODO: update fulfillment status
      break;
    case 'FULFILLMENT_REJECTED':
      console.log('Fulfillment rejected:', resourceUrl);
      // TODO: handle rejected fulfillment
      break;
    default:
      console.log(`Unhandled resource_type: ${resourceType}`);
  }

  // 4. Fetch the real data from resource_url (authenticated). Never let a
  // downstream fetch error turn into a 500 — the request is already validated.
  try {
    const resource = await fetchResource(
      resourceUrl,
      process.env.SHIPSTATION_API_KEY,
      process.env.SHIPSTATION_API_SECRET
    );
    if (resource) {
      console.log('Fetched resource for', resourceType);
      // TODO: process `resource` idempotently (dedupe on order/shipment id)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Resource fetch failed:', message);
  }

  // 5. Acknowledge receipt
  return NextResponse.json({ received: true });
}
