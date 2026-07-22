// Generated with: tiktok-shop-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const APP_KEY = process.env.TIKTOK_SHOP_APP_KEY ?? '';
const APP_SECRET = process.env.TIKTOK_SHOP_APP_SECRET ?? '';

// TikTok Shop does NOT publish a complete numeric `type` -> topic mapping
// ("Do not branch only on the numeric type; use the subscribed event_type
// context" — official webhooks overview). Only `type: 1` appears in the
// official sample payload, for ORDER_STATUS_CHANGE. Fill this map from YOUR
// OWN Partner Center subscriptions — or better, register a distinct callback
// URL per event_type (the Update Shop Webhook API takes one address per
// topic) so the route itself identifies the event.
const SUBSCRIBED_TYPE_TO_EVENT: Record<number, string> = {
  1: 'ORDER_STATUS_CHANGE', // per the official sample payload
};

/**
 * Verify a TikTok Shop webhook signature.
 *
 * TikTok Shop signs: HMAC-SHA256(key = app_secret, message = app_key + rawBody),
 * lowercase hex, delivered in the `Authorization` header (no "Bearer" prefix).
 * There is no timestamp in the signature (no replay protection).
 */
export function verifyTikTokShop(
  rawBody: string,
  authHeader: string | null,
  appKey: string,
  appSecret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(appKey + rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(authHeader ?? '', 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification — do not parse first.
  const rawBody = await request.text();
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return new NextResponse('Missing Authorization header', { status: 401 });
  }

  if (!verifyTikTokShop(rawBody, authHeader, APP_KEY, APP_SECRET)) {
    // TikTok Shop treats 401 as a rejected signature.
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let payload: { type: number; tts_notification_id?: string; shop_id?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // Delivery is at-least-once: dedupe on tts_notification_id before processing.
  const eventName = SUBSCRIBED_TYPE_TO_EVENT[payload.type] ?? `UNKNOWN_TYPE_${payload.type}`;
  const data = payload.data ?? {};

  switch (eventName) {
    case 'ORDER_STATUS_CHANGE':
      console.log('Order status changed:', data.order_id, data.order_status);
      // TODO: sync order, trigger fulfilment, notify customer, etc.
      break;

    case 'RECIPIENT_ADDRESS_UPDATE':
      console.log('Recipient address updated:', data.order_id);
      // TODO: refresh shipping label / warehouse record.
      break;

    case 'PACKAGE_UPDATE':
      console.log('Package updated:', data.package_id);
      // TODO: re-fetch package details, update tracking.
      break;

    case 'PRODUCT_STATUS_CHANGE':
      console.log('Product status changed:', data.product_id);
      // TODO: sync catalog availability.
      break;

    case 'SELLER_DEAUTHORIZATION':
      console.log('Seller deauthorized shop:', payload.shop_id);
      // TODO: disable sync, purge stored access tokens for this shop.
      break;

    default:
      console.log(`Unhandled event (type=${payload.type}): ${eventName}`);
  }

  // Acknowledge within 3 seconds: 200 with an empty body.
  return new NextResponse(null, { status: 200 });
}
