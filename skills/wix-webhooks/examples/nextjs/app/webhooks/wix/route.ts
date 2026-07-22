// Generated with: wix-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { AppStrategy, createClient } from '@wix/sdk';
import { orders } from '@wix/ecom';

// The public key is stored on one line in .env with `\n` escapes; restore the
// real newlines. (@wix/sdk also accepts a base64-encoded PEM.)
const PUBLIC_KEY = (process.env.WIX_PUBLIC_KEY || '').replace(/\\n/g, '\n');
const APP_ID = process.env.WIX_APP_ID || '';

// The Wix client verifies the webhook JWT (RS256) with your app's public key
// and dispatches decoded events to the handlers registered below.
const client = createClient({
  auth: AppStrategy({ appId: APP_ID, publicKey: PUBLIC_KEY }),
  modules: { orders },
});

// In-memory dedupe store. Wix retries deliveries, so the same event can arrive
// more than once and out of order. Use a durable store (Redis, DB) in production.
const processedEvents = new Set<string>();

function handleOnce(eventId: string | undefined, handler: () => void) {
  if (eventId && processedEvents.has(eventId)) {
    console.log(`Duplicate event ${eventId} ignored`);
    return;
  }
  if (eventId) processedEvents.add(eventId);
  handler();
}

// Register a handler per event type. `event.metadata` always has instanceId
// (the site), _id (the event ID), and entityId (the affected entity).
client.orders.onOrderCreated((event) =>
  handleOnce(event.metadata._id, () => {
    console.log('Order created:', event.metadata.entityId, 'on site', event.metadata.instanceId);
    // TODO: fulfil order, notify, sync to your system
  })
);

client.orders.onOrderApproved((event) =>
  handleOnce(event.metadata._id, () => {
    console.log('Order approved:', event.metadata.entityId);
    // TODO: trigger fulfilment, grant access
  })
);

client.orders.onOrderUpdated((event) =>
  handleOnce(event.metadata._id, () => {
    console.log('Order updated:', event.metadata.entityId);
    // TODO: sync order changes
  })
);

client.orders.onOrderCanceled((event) =>
  handleOnce(event.metadata._id, () => {
    console.log('Order canceled:', event.metadata.entityId);
    // TODO: reverse fulfilment, revoke access
  })
);

export async function POST(request: Request) {
  // Wix sends the JWT as the raw request body. Read it as text (NOT JSON) so the
  // exact bytes reach the verifier — re-serialized JSON breaks the signature.
  const rawBody = await request.text();

  if (!rawBody) {
    return new Response('Missing webhook body', { status: 400 });
  }

  try {
    // process() verifies the signature, decodes the event, and runs any matching
    // handlers. It throws on an invalid signature or expired token.
    const { eventType } = await client.webhooks.process(rawBody);
    console.log(`Processed ${eventType}`);
  } catch (err) {
    console.error('Webhook verification failed:', (err as Error).message);
    return new Response('Invalid webhook signature or payload', { status: 400 });
  }

  // Acknowledge fast (within ~1250 ms) so Wix doesn't retry.
  return new Response('OK', { status: 200 });
}
