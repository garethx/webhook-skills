// Generated with: bigcommerce-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { Webhook, WebhookVerificationError } from 'standardwebhooks';

// BigCommerce signs callbacks using the Standard Webhooks spec. The signing key
// is your app's CLIENT SECRET, base64-encoded. The standardwebhooks library
// base64-decodes whatever you pass in, so encoding the client secret first
// yields the raw client-secret bytes as the HMAC key.
function getWebhook(): Webhook {
  const clientSecret = process.env.BIGCOMMERCE_CLIENT_SECRET || '';
  return new Webhook(Buffer.from(clientSecret).toString('base64'));
}

interface BigCommerceEvent {
  store_id?: string;
  producer?: string;
  scope: string;
  data?: { type?: string; id?: number };
  hash?: string;
  created_at?: number;
}

export async function POST(req: NextRequest) {
  // Read the RAW body — verification must run over the exact bytes BigCommerce
  // signed, before any JSON parsing.
  const rawBody = await req.text();

  let event: BigCommerceEvent;
  try {
    event = getWebhook().verify(rawBody, {
      'webhook-id': req.headers.get('webhook-id') ?? '',
      'webhook-timestamp': req.headers.get('webhook-timestamp') ?? '',
      'webhook-signature': req.headers.get('webhook-signature') ?? '',
    }) as BigCommerceEvent;
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.error('BigCommerce webhook verification failed:', err.message);
      return new NextResponse('Invalid signature', { status: 400 });
    }
    console.error('Failed to process webhook:', err);
    return new NextResponse('Invalid payload', { status: 400 });
  }

  // BigCommerce payloads are thin: `scope` is the event, `data` carries only the
  // resource type and id. Call back to the REST API to fetch full details.
  const { scope, data } = event;

  switch (scope) {
    case 'store/order/created':
      console.log(`Order created: ${data?.id}`);
      // TODO: Fetch the order via GET /v2/orders/{id}, fulfil, notify
      break;

    case 'store/order/updated':
      console.log(`Order updated: ${data?.id}`);
      // TODO: Re-sync order details
      break;

    case 'store/order/statusUpdated':
      console.log(`Order status updated: ${data?.id}`);
      // TODO: Fetch order status, trigger fulfilment or refund flows
      break;

    case 'store/product/created':
      console.log(`Product created: ${data?.id}`);
      // TODO: Index the new product in your catalog
      break;

    case 'store/product/updated':
      console.log(`Product updated: ${data?.id}`);
      // TODO: Re-sync product details
      break;

    case 'store/product/deleted':
      console.log(`Product deleted: ${data?.id}`);
      // TODO: Remove the product from your catalog
      break;

    case 'store/product/inventory/updated':
      console.log(`Product inventory updated: ${data?.id}`);
      // TODO: Update stock levels downstream
      break;

    case 'store/customer/created':
      console.log(`Customer created: ${data?.id}`);
      // TODO: Sync customer to CRM / marketing list
      break;

    case 'store/cart/created':
      console.log(`Cart created: ${data?.id}`);
      // TODO: Track cart for analytics
      break;

    case 'store/cart/abandoned':
      console.log(`Cart abandoned: ${data?.id}`);
      // TODO: Trigger an abandoned-cart recovery email
      break;

    default:
      console.log(`Unhandled scope: ${scope}`);
  }

  // Respond 200 immediately so BigCommerce marks delivery successful.
  // Do heavy work asynchronously (queue) to avoid retries and blocklisting.
  return NextResponse.json({ received: true });
}
