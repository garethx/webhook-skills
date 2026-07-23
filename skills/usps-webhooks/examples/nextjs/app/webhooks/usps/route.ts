// Generated with: usps-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a USPS webhook signature.
 *
 * USPS signs `timestamp + payload` (the envelope's `timestamp` field
 * concatenated with the raw, stringified `payload` field) with HMAC-SHA256
 * keyed on the subscription `secret`, and sends the Base64 digest in the
 * `X-HMAC` header (deprecated alias: `hmac-header`).
 */
export function verifyUspsSignature(
  timestamp: string,
  payload: string,
  hmacHeader: string | null,
  secret: string
): boolean {
  if (!hmacHeader) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + payload)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected));
  } catch {
    return false; // buffer length mismatch = invalid
  }
}

interface UspsEnvelope {
  subscriptionId: string;
  subscriptionType: string;
  timestamp: string;
  payload: string;
  links?: unknown[];
}

export async function POST(request: NextRequest) {
  // Raw body is needed to reconstruct the signed content
  const rawBody = await request.text();
  const hmacHeader =
    request.headers.get('x-hmac') ?? request.headers.get('hmac-header');

  // Parse the envelope to read the signed fields (timestamp + payload).
  // The inner `payload` is used verbatim for verification - never re-serialize it.
  let envelope: UspsEnvelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { subscriptionId, subscriptionType, timestamp, payload } = envelope;

  // Verify the signature over `timestamp + payload`
  if (
    !verifyUspsSignature(timestamp, payload, hmacHeader, process.env.USPS_WEBHOOK_SECRET!)
  ) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Only now is it safe to parse the inner payload
  let tracking: Record<string, unknown>;
  try {
    tracking = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  console.log(`Received ${subscriptionType} notification (${subscriptionId})`);

  // Dispatch on subscription type (currently only TRACKING)
  switch (subscriptionType) {
    case 'TRACKING':
      handleTrackingEvent(tracking);
      break;
    default:
      console.log(`Unhandled subscriptionType: ${subscriptionType}`);
  }

  // Acknowledge quickly. USPS has no documented retry - do heavy work async.
  return NextResponse.json({ received: true });
}

/**
 * Handle a TRACKING notification payload, dispatching on tracking status.
 */
function handleTrackingEvent(tracking: Record<string, unknown>) {
  const status = tracking.status as string | undefined;
  console.log(`Tracking ${tracking.trackingNumber}: ${status}`);

  switch (status) {
    case 'Pre-Shipment':
      // TODO: Show "label created" in the customer's order status
      break;
    case 'Accepted':
      // TODO: Mark order as shipped / in-network
      break;
    case 'In Transit':
      // TODO: Update ETA / live tracking timeline
      break;
    case 'Out for Delivery':
      // TODO: Send "arriving today" notification
      break;
    case 'Delivered':
      // TODO: Close the shipment, request a review, release funds
      break;
    case 'Available for Pickup':
      // TODO: Notify customer to collect the package
      break;
    case 'Delivery Attempt':
      // TODO: Prompt customer to reschedule / update address
      break;
    case 'Alert':
      // TODO: Alert support, notify customer of a delay
      break;
    default:
      console.log(`Unhandled tracking status: ${status}`);
  }
}
