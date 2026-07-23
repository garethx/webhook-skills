// Generated with: walmart-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Reject deliveries whose timestamp differs from now by more than this, in either
// direction (a symmetric ±5 min window that also absorbs modest clock skew).
const REPLAY_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Walmart performance webhook signature.
 *
 * Walmart signs a canonical string, NOT the raw body directly:
 *   <METHOD>\n<PATH_AND_QUERY>\n<WM_SEC.TIMESTAMP>\n<SHA256_HEX_OF_RAW_BODY>
 * signature = base64(HMAC_SHA256(secret, stringToSign))
 */
export function verifyWalmartWebhook({
  method,
  pathWithQuery,
  timestamp,
  rawBody,
  signature,
  secret,
}: {
  method: string;
  pathWithQuery: string;
  timestamp: string | null;
  rawBody: string;
  signature: string | null;
  secret: string;
}): boolean {
  if (!timestamp || !signature) return false;

  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex'); // lowercase hex
  const stringToSign = [method.toUpperCase(), pathWithQuery, timestamp, bodyHash].join('\n');
  const expected = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // length mismatch = invalid
  }
}

/** Reject stale deliveries (replay protection). WM_SEC.TIMESTAMP is Unix epoch seconds. */
export function isTimestampFresh(
  timestamp: string | null,
  toleranceSeconds = REPLAY_TOLERANCE_SECONDS
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= toleranceSeconds;
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification (do not parse first).
  const rawBody = await request.text();
  const url = new URL(request.url);
  const pathWithQuery = url.pathname + url.search;

  const timestamp = request.headers.get('wm_sec.timestamp');
  const signature = request.headers.get('wm_sec.signature');
  // const keyId = request.headers.get('wm_sec.key_id'); // optional: select secret during rotation

  // 1. Verify the signature.
  const valid = verifyWalmartWebhook({
    method: request.method,
    pathWithQuery,
    timestamp,
    rawBody,
    signature,
    secret: process.env.WALMART_WEBHOOK_SECRET!,
  });

  if (!valid) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 2. Reject stale/replayed deliveries.
  if (!isTimestampFresh(timestamp)) {
    console.error('Webhook timestamp outside replay window');
    return NextResponse.json({ error: 'Stale timestamp' }, { status: 400 });
  }

  // 3. Parse only after verification.
  const payload = JSON.parse(rawBody);
  const eventType: string = payload.eventType;

  // 4. Confirm the seller is one you're authorized to process.
  // if (!isAuthorizedSeller(payload.sellerId)) return NextResponse.json({ received: true });

  console.log(`Received ${eventType} (${payload.resourceName}) for seller ${payload.sellerId}`);

  // 5. Handle the event by type.
  switch (eventType) {
    case 'PO_CREATED':
      console.log('New purchase order:', payload.resource?.purchaseOrderId);
      // TODO: reserve inventory, acknowledge order, start pick/pack/ship
      break;

    case 'PO_LINE_AUTOCANCELLED':
      console.log('PO line auto-cancelled:', payload.resource?.purchaseOrderId);
      // TODO: release inventory, update OMS
      break;

    case 'INTENT_TO_CANCEL':
      console.log('Customer intent to cancel:', payload.resource?.purchaseOrderId);
      // TODO: halt fulfillment if not yet shipped
      break;

    case 'INVENTORY_OOS':
      console.log('Item out of stock:', payload.resource);
      // TODO: trigger replenishment
      break;

    case 'OFFER_PUBLISHED':
      console.log('Offer published:', payload.resource);
      // TODO: enable listing in your catalog
      break;

    case 'OFFER_UNPUBLISHED':
      console.log('Offer unpublished:', payload.resource);
      // TODO: investigate suppression
      break;

    case 'BUY_BOX_CHANGED':
      console.log('Buy Box changed:', payload.resource);
      // TODO: reprice, alert pricing team
      break;

    case 'RETURN_CREATED':
      console.log('Return created:', payload.resource);
      // TODO: start returns workflow
      break;

    case 'REPORT_STATUS':
      console.log('Report ready:', payload.resource);
      // TODO: download and ingest the report
      break;

    case 'SELLER_PERFORMANCE_ALARMS':
      console.log('Seller performance alarm:', payload.resource);
      // TODO: alert account team
      break;

    default:
      console.log(`Unhandled eventType: ${eventType}`);
  }

  // 6. Acknowledge only AFTER durable work. Respond within 3 seconds.
  return NextResponse.json({ received: true });
}
