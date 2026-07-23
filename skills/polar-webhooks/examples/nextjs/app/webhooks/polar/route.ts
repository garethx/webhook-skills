// Generated with: polar-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';

export async function POST(request: NextRequest) {
  // Read the RAW body — signature verification must run on the exact bytes.
  const body = await request.text();

  // Standard Webhooks headers. validateEvent expects a plain Record<string, string>.
  const headers = {
    'webhook-id': request.headers.get('webhook-id') ?? '',
    'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
    'webhook-signature': request.headers.get('webhook-signature') ?? '',
  };

  let event;
  try {
    // validateEvent verifies the signature AND parses the payload against the
    // SDK's typed schema. Pass the secret as-is — the SDK base64-encodes it.
    event = validateEvent(body, headers, process.env.POLAR_WEBHOOK_SECRET ?? '');
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      // Signature check failed -> the request is not from Polar. Reject it.
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    // Signature was valid, but this SDK version could not parse the payload
    // (an unknown or newer event type). The event IS authentic, so acknowledge
    // it with a 2xx — an error would make Polar retry and eventually auto-disable.
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.warn('Received a valid webhook the SDK could not parse:', message);
    return NextResponse.json({ received: true, parsed: false }, { status: 202 });
  }

  // Handle the event based on its type. `event.data` is the resource itself
  // (an Order, Subscription, Customer, etc.).
  switch (event.type) {
    case 'checkout.updated':
      console.log('Checkout updated:', event.data.id);
      // TODO: track conversion, react to a confirmed checkout
      break;

    case 'order.created':
      console.log('Order created:', event.data.id);
      // TODO: record the order (check event.data.billingReason)
      break;

    case 'order.paid':
      console.log('Order paid:', event.data.id);
      // TODO: fulfill the purchase, grant access, send a receipt
      break;

    case 'order.refunded':
      console.log('Order refunded:', event.data.id);
      // TODO: reverse fulfillment, update accounting
      break;

    case 'subscription.created':
      console.log('Subscription created:', event.data.id);
      // TODO: provision access, send a welcome email
      break;

    case 'subscription.canceled':
      console.log('Subscription canceled (cancels at period end):', event.data.id);
      // TODO: schedule retention, mark pending cancellation
      break;

    case 'subscription.revoked':
      console.log('Subscription revoked:', event.data.id);
      // TODO: revoke access to paid features
      break;

    case 'customer.state_changed':
      console.log('Customer state changed:', event.data.id);
      // TODO: sync entitlements from the customer state
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Respond fast (Polar times out at 10s) to acknowledge receipt.
  return NextResponse.json({ received: true });
}
