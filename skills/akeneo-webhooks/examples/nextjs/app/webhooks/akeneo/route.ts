// Generated with: akeneo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// 5-minute replay window (seconds)
const TIMESTAMP_TOLERANCE = 300;

interface AkeneoEvent {
  action: string;
  event_id?: string;
  event_datetime?: string;
  author?: string;
  author_type?: string;
  pim_source?: string;
  data?: { resource?: Record<string, unknown> };
}

/**
 * Verify an Akeneo webhook signature.
 *
 * Akeneo signs `timestamp + "." + rawBody` with HMAC-SHA256 (hex) using the
 * connection secret, sending the result in `x-akeneo-request-signature`.
 */
function verifyAkeneoWebhook(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string
): boolean {
  if (!signature || !timestamp) {
    return false;
  }

  // Replay protection: reject stale requests
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > TIMESTAMP_TOLERANCE) {
    return false;
  }

  // Recompute HMAC over `timestamp + "." + rawBody`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison (guards against length mismatch)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// Dispatch a single event by its `action`
function handleAkeneoEvent(event: AkeneoEvent): void {
  const resource = event.data?.resource as Record<string, unknown> | undefined;

  switch (event.action) {
    case 'product.created':
      console.log('Product created:', resource?.identifier);
      // TODO: Sync new SKU downstream, index for search, etc.
      break;

    case 'product.updated':
      console.log('Product updated:', resource?.identifier);
      // TODO: Re-sync attributes, invalidate caches, etc.
      break;

    case 'product.removed':
      console.log('Product removed:', resource?.identifier);
      // TODO: Remove from storefront/catalog, etc.
      break;

    case 'product_model.created':
      console.log('Product model created:', resource?.code);
      // TODO: Create parent/variant groupings, etc.
      break;

    case 'product_model.updated':
      console.log('Product model updated:', resource?.code);
      // TODO: Re-sync model-level attributes, etc.
      break;

    case 'product_model.removed':
      console.log('Product model removed:', resource?.code);
      // TODO: Clean up variant groupings, etc.
      break;

    default:
      console.log(`Unhandled event: ${event.action}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification (do NOT parse first)
  const rawBody = await request.text();
  const signature = request.headers.get('x-akeneo-request-signature');
  const timestamp = request.headers.get('x-akeneo-request-timestamp');

  // Verify webhook signature
  if (!verifyAkeneoWebhook(rawBody, signature, timestamp, process.env.AKENEO_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification
  const payload = JSON.parse(rawBody);
  const events: AkeneoEvent[] = Array.isArray(payload.events) ? payload.events : [];

  // Akeneo batches up to 10 events per request. Akeneo does not retry and expects
  // a fast 2xx — offload heavy work to a queue/worker in production.
  for (const event of events) {
    handleAkeneoEvent(event);
  }

  return NextResponse.json({ received: true });
}
