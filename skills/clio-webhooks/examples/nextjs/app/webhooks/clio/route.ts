// Generated with: clio-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Clio webhook signature.
 *
 * Clio sends the hex-encoded HMAC-SHA256 of the raw body (keyed with the shared
 * secret) in the `X-Hook-Signature` header. Verify against the RAW body.
 */
function verifyClioWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guards against wrong-length / malformed hex.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // 1. Handshake: Clio sends X-Hook-Secret when the webhook is created or its URL
  //    changes. Confirm activation by echoing the secret back with 200. The
  //    webhook is not enabled until this handshake succeeds.
  const hookSecret = request.headers.get('x-hook-secret');
  if (hookSecret) {
    console.log('Clio handshake received - confirming activation');
    return new NextResponse(null, {
      status: 200,
      headers: { 'X-Hook-Secret': hookSecret },
    });
    // Tip: persist `hookSecret` (as CLIO_WEBHOOK_SECRET, keyed by webhook_id)
    // so you can verify signatures on later deliveries.
  }

  // 2. Event delivery: read the RAW body and verify X-Hook-Signature.
  const body = await request.text();
  const signature = request.headers.get('x-hook-signature');

  if (!verifyClioWebhook(body, signature, process.env.CLIO_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification.
  const payload = JSON.parse(body);
  const event = payload.meta?.event;
  const webhookId = payload.meta?.webhook_id;
  const record = payload.data ?? {};

  console.log(`Received "${event}" event (webhook: ${webhookId}, id: ${record.id})`);

  // Handle the event based on meta.event.
  switch (event) {
    case 'created':
      console.log(`Record created: ${record.id}`);
      // TODO: sync the new record into your system
      break;

    case 'updated':
      console.log(`Record updated: ${record.id}`);
      // TODO: update your local copy
      break;

    case 'deleted':
      console.log(`Record deleted: ${record.id}`);
      // TODO: soft-delete / archive locally
      break;

    case 'matter_opened':
      console.log(`Matter opened: ${record.id}`);
      // TODO: kick off intake / billing setup
      break;

    case 'matter_pended':
      console.log(`Matter pended: ${record.id}`);
      // TODO: pause automations
      break;

    case 'matter_closed':
      console.log(`Matter closed: ${record.id}`);
      // TODO: final invoicing / close-out
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Respond quickly (2xx) to acknowledge; defer heavy work.
  return NextResponse.json({ received: true });
}
