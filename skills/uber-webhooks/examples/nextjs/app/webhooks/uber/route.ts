// Generated with: uber-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Uber Eats webhook signature.
 *
 * Uber signs the raw request body with HMAC-SHA256 keyed on your app's
 * client secret and sends the digest as a lowercased hex string in the
 * X-Uber-Signature header (no "sha256=" prefix).
 */
function verifyUberWebhook(rawBody: string, signatureHeader: string | null, clientSecret: string): boolean {
  if (!signatureHeader) {
    return false;
  }

  // Compute expected signature: lowercase hex HMAC-SHA256 of the raw body
  const expectedSignature = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false; // Malformed hex or length mismatch
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('x-uber-signature');

  // Verify webhook signature against the raw body
  if (!verifyUberWebhook(body, signature, process.env.UBER_CLIENT_SECRET!)) {
    console.error('Webhook signature verification failed');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  // Parse the payload after verification. The event type is in the body.
  const payload = JSON.parse(body);
  const eventType = payload.event_type;
  const resourceHref = payload.resource_href ?? payload.meta?.resource_href;

  console.log(`Received ${eventType} event (id: ${payload.event_id})`);

  // Handle the event based on its event_type
  switch (eventType) {
    case 'orders.notification':
      console.log('New order created:', resourceHref);
      // TODO: Fetch the full order from resource_href, ingest into POS
      break;

    case 'orders.cancel':
      console.log('Order cancelled:', resourceHref);
      // TODO: Void the order, stop preparation
      break;

    case 'orders.failure':
      console.log('Order failed/cancelled (v1.0.0):', resourceHref);
      // TODO: Void the order, alert staff
      break;

    case 'orders.release':
      console.log('Order released (courier at geo-fence):', resourceHref);
      // TODO: Start final preparation / hand-off
      break;

    case 'orders.scheduled.notification':
      console.log('Scheduled order created:', resourceHref);
      // TODO: Queue the order for its scheduled time
      break;

    case 'order.fulfillment_issues.resolved':
      console.log('Fulfillment issue resolved:', resourceHref);
      // TODO: Update the order, resume preparation
      break;

    case 'store.provisioned':
      console.log('Store provisioned:', payload.meta?.resource_id);
      // TODO: Begin syncing menu/availability
      break;

    case 'store.deprovisioned':
      console.log('Store deprovisioned:', payload.meta?.resource_id);
      // TODO: Stop syncing, clean up
      break;

    case 'store.status.changed':
      console.log('Store status changed:', payload.meta?.status);
      // TODO: Reflect open/closed state in your system
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }

  // Acknowledge with HTTP 200 and an empty body
  return new NextResponse(null, { status: 200 });
}
