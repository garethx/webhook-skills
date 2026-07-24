// Generated with: enode-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Enode webhook signature.
 *
 * Enode signs the RAW request body with HMAC-SHA1 keyed on the per-webhook
 * secret you generated, and sends it in the `x-enode-signature` header
 * formatted as `sha1=<hex>`.
 */
function verifyEnodeWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  // Header format: sha1=<hex>
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha1' || !sig) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; returns false on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

interface EnodeEvent {
  event: string;
  createdAt?: string;
  version?: string;
  user?: { id?: string };
  vehicle?: { id?: string };
  charger?: { id?: string };
  battery?: { id?: string };
}

/**
 * Dispatch a single Enode event. The webhook body is an ARRAY of events,
 * so this is called once per element.
 */
function handleEnodeEvent(evt: EnodeEvent): void {
  switch (evt.event) {
    case 'enode:webhook:test':
      console.log('Test webhook received — receiver is reachable');
      break;

    case 'system:heartbeat':
      console.log('Heartbeat received at', evt.createdAt);
      break;

    case 'user:vehicle:updated':
      console.log(`Vehicle updated for user ${evt.user?.id}:`, evt.vehicle?.id);
      // TODO: Sync charge state, battery level, location, etc.
      break;

    case 'user:vehicle:discovered':
      console.log(`Vehicle discovered for user ${evt.user?.id}:`, evt.vehicle?.id);
      // TODO: Onboard the new device, backfill data
      break;

    case 'user:charger:updated':
      console.log(`Charger updated for user ${evt.user?.id}:`, evt.charger?.id);
      // TODO: Sync charging status, availability
      break;

    case 'user:battery:updated':
      console.log(`Battery updated for user ${evt.user?.id}:`, evt.battery?.id);
      // TODO: Track state of charge, power flow
      break;

    case 'user:credentials:invalidated':
      console.log(`Credentials invalidated for user ${evt.user?.id}`);
      // TODO: Prompt the user to re-link their vendor account
      break;

    default:
      console.log(`Unhandled event: ${evt.event}`);
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('x-enode-signature');
  const deliveryId = request.headers.get('x-enode-delivery');

  // Verify webhook signature against the RAW body
  if (!verifyEnodeWebhook(body, signature, process.env.ENODE_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload after verification - Enode sends an ARRAY of events
  let events: unknown;
  try {
    events = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(events)) {
    return NextResponse.json({ error: 'Expected an array of events' }, { status: 400 });
  }

  console.log(`Received ${events.length} event(s) (delivery: ${deliveryId})`);

  for (const evt of events as EnodeEvent[]) {
    handleEnodeEvent(evt);
  }

  // Return 200 quickly to acknowledge receipt (Enode times out after 5s)
  return NextResponse.json({ received: true });
}
